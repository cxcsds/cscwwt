#!/usr/bin/env python

"""Usage:

 ./create_stack_outline.py fovdir outfile

Aim:

Create the stack outline data for the WWT process.

All FOV files in fovdir are processed, and the OBS_ID/OBSIDxxx keyworda
are used to identify the obsids in each stack.

To save space the data is restircted to 4dp for the polygon edges,

To try and allow the WWT display to fill the polygons ensure that the
ordering is anti-clockwise (the WWT documentation does not make it
clear what is actually needed, so this is just my best guess).

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


def read_fov(fovpath, ndp=4):
    """Create a list of regions, where each region begins with an
    included shape and any subsequent regions are excluded.

    This assumes that the region file is listed in this order!

    This also returns OBSID values but we end up not using it.

    """

    cr = pycrates.read_file(str(fovpath) + "[cols shape,pos,eqpos]")
    if cr.get_nrows() == 0:
        raise OSError(str(fovfile))

    stack = cr.get_key_value("STACK_ID")

    obsids: list[int] = []
    obsval = cr.get_key_value("OBS_ID")
    if obsval == "LIST":
        n = 1
        while obsval := cr.get_key_value(f"OBSID{n:03d}"):
            obsids.append(int(obsval))
            n += 1

    else:
        obsids.append(int(obsval))

    fmt = f"{{:.{ndp}f}}"

    # Store as strings to ensure we limmit the number of decimal places; we assume
    # NaN values indicate invalid points and so we do not need to
    # bother closing out a polygon.
    #
    store = []
    out = None
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
    return stack, store, obsids


def add_stack(stacks: dict, infov: Path) -> None:
    """Add the FOV to the stacks dictionary."""

    stk, shapes, obsids = read_fov(infov)
    if stk in stacks:
        raise OSError(f"Multiple {stk} / {infov}")

    stacks[stk] = {"stack": stk,
                   "polygons": shapes,
                   "obsids": obsids}


def doit(indir, outfile):

    inpath = Path(indir)
    outpath = Path(outfile)
    if not inpath.is_dir():
        raise OSError(f"indir={indir} is not a directory")

    if outpath.exists():
        raise OSError(f"outfile={outfile} exists!")

    stacks = {}
    for infov in inpath.glob("*_fov3.fits*"):
        add_stack(stacks, infov)


    print(f"Found {len(stacks)} stacks")

    # output only after we've read in all the data.
    #
    # I could have just serialized with json but I wanted the
    # restricted output which I'm sure could be done, but
    # let's be lazy.
    #
    with open(outfile, 'wt') as ofh:
        ofh.write("{\n")
        first = True
        for stackdata in stacks.values():
            if first:
                first = False
            else:
                ofh.write(",")

            stack = stackdata["stack"]
            ofh.write(f'"{stack}": [\n')
            fshape = True
            for shapes in stackdata["polygons"]:
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
