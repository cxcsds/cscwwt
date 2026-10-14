#!/usr/bin/env python

"""Usage:

 ./create_ensemble_outline.py fovdir outfile

Aim:

Create the ensemble outline data for the WWT process.

The fovdir is assumed to contain fov_ens*.fits files created by
combine_ensemble_fovs.py

To save space the data is restircted to 4dp for the polygon edges,

To try and allow the WWT display to fill the polygons ensure that the
ordering is anti-clockwise (the WWT documentation does not make it
clear what is actually needed, so this is just my best guess).

We use the same "conversion" scheme as ens2json.py

"""

from pathlib import Path
import sys

import numpy as np

import pycrates


def is_clockwise(points: np.ndarray) -> bool:
    """Are the points in clockwise ordering?

    The points are assumed to represent a simple polygon, and are
    in sky coordinates to ensure no WCS trickery.
    """

    assert points.ndim == 2, points.ndim
    assert points.shape[0] == 2, points.shape
    assert points.shape[1] > 2, points.shape

    # Not trying to make this efficient
    n = points.shape[1]
    x = points[0]
    y = points[1]

    area = 0.0
    for i in range(n):
        i1 = (i + 1) % n
        area += x[i] * y[i1] - x[i1] * y[i]

    return area <= 0


def clean(ensemble):
    """Grab the actual ensemble value.

    This makes it a little easier for me downstream.

    """

    assert ensemble.startswith('ens'), ensemble
    assert ensemble.endswith(('00_001', '00_002', '00_003')), ensemble

    # return ensemble
    return int(ensemble[3:-6])


def read_fov(fovpath, ndp=4):
    """Create a list of regions, where each region begins with an
    included shape and any subsequent regions are excluded.

    This assumes that the region file is listed in this order!

    """

    cr = pycrates.read_file(str(fovpath) + "[cols shape,pos,eqpos]")
    if cr.get_nrows() == 0:
        raise OSError(str(fovfile))

    ensemble = cr.get_key_value("ENSEMBLE")
    assert ensemble is not None, str(fovpath)

    fmt = f"{{:.{ndp}f}}"

    # Store as strings to ensure we limit the number of decimal places; we assume
    # NaN values indicate invalid points and so we do not need to
    # bother closing out a polygon.
    #
    store = []
    out = None
    last_ordering = None
    for shape, pos, eqpos in zip(cr.SHAPE.values,
                                 cr.POS.values,
                                 cr.EQPOS.values):
        polygon = []
        last_coords = []
        ra = eqpos[0]
        dec = eqpos[1]
        idx = np.isfinite(ra)
        ra = ra[idx]
        dec = dec[idx]

        for r,d in zip(ra, dec):
            coords = [fmt.format(r), fmt.format(d)]
            if coords == last_coords:
                # save space by avoiding repeated points
                continue

            polygon.append(coords)
            last_coords = coords

        # Ensure the coordinates are in a particular order
        if is_clockwise(pos[:, idx]):
            polygon = polygon[::-1]

        if shape == "Polygon":
            if out is not None:
                store.append(out)

            out = [polygon]

        elif shape == "!Polygon":
            assert out is not None
            out.append(polygon)

        else:
            raise ValueError(f"Unknown shape {shape} in {fovfile}")

    # Save the last set of shapes
    store.append(out)
    return ensemble, store


def add_ensemble(ensembles: dict, infov: Path) -> None:
    """Add the FOV to the ensembles dictionary."""

    ensemble, shapes = read_fov(infov)
    if ensemble in ensembles:
        raise OSError(f"Multiple {ensemble} / {infov}")

    ensembles[ensemble] = {"ensemble": ensemble,
                           "polygons": shapes}


def doit(indir, outfile):

    inpath = Path(indir)
    outpath = Path(outfile)
    if not inpath.is_dir():
        raise OSError(f"indir={indir} is not a directory")

    if outpath.exists():
        raise OSError(f"outfile={outfile} exists!")

    ensembles = {}
    for infov in inpath.glob("fov_ens*.fits*"):
        add_ensemble(ensembles, infov)

    print(f"Found {len(ensembles)} ensembles")

    # output only after we've read in all the data.
    #
    # I could have just serialized with json but I wanted the
    # restricted output which I'm sure could be done, but
    # let's be lazy.
    #
    with open(outfile, 'wt') as ofh:
        ofh.write("{\n")
        first = True
        for ensdata in ensembles.values():
            if first:
                first = False
            else:
                ofh.write(",")

            ensemble = clean(ensdata["ensemble"])
            ofh.write(f'"{ensemble}": [\n')
            fshape = True
            for shapes in ensdata["polygons"]:
                if fshape:
                    fshape = False
                else:
                    ofh.write(",")

                ofh.write("[")
                fargh = True
                for shape in shapes:
                    if fargh:
                        fargh = False
                    else:
                        ofh.write("\n,")

                    fpoly = True
                    ofh.write("[")
                    for ra, dec in shape:
                        if fpoly:
                            fpoly = False
                        else:
                            ofh.write(",")

                        ofh.write(f"[{ra},{dec}]")

                    ofh.write("]\n")

                ofh.write("]\n")

            ofh.write("]\n")

        ofh.write("}\n")

    print(f"Created: {outfile}")


if __name__ == "__main__":

    if len(sys.argv) != 3:
        sys.stderr.write(f"Usage: {sys.argv[0]} fovdir outdir\n")
        sys.exit(1)

    doit(sys.argv[1], sys.argv[2])
