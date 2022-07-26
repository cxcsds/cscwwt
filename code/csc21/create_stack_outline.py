#!/usr/bin/env python

"""Usage:

 ./create_stack_outline.py stack-list fovdir outfile

Aim:

Create the stack outline data for the WWT process.

The data is restricted to 4 decimal places as this is ~ 0.5 arcsecond
resolution. Need to check this as it may have changed.

This originally reported several bits of info about each stack, but it
is now just the outlines.

"""

from pathlib import Path
import sys

import numpy as np

import pycrates


def read_fov(fovdir, stack, ndp=4):
    """Create a list of regions, where each region begins with an
    included shape and any subsequent regions are excluded.

    This assumes that the region file is listed in this order!
    """

    fovfile = fovdir / f"{stack}.fov"
    cr = pycrates.read_file(str(fovfile) + "[cols shape,eqpos]")
    if cr.get_nrows() == 0:
        raise OSError(str(fovfile))

    fmt = f"{{:.{ndp}f}}"

    # Store as strings to ensure we limmit the number of decimal places; we assume
    # NaN values indicate invalid points and so we do not need to
    # bother closing out a polygon.
    #
    store = []
    out = None
    for shape, eqpos in zip(cr.SHAPE.values, cr.EQPOS.values):
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
    return store


def doit(stackfile, fovdir, outfile):

    fovdir = Path(fovdir)
    if not fovdir.is_dir():
        raise OSError(f"fovdir={fovdir} is not a directory")

    outfile = Path(outfile)
    if outfile.is_file():
        raise OSError(f"outfile={outfile} exists and there's no clobber")

    stacks = {}
    with open(stackfile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '':
                continue

            toks = l.split(' ')
            if len(toks) != 2:
                raise OSError(f"Invalid line: {l}")

            stk = toks[0]
            obsids = toks[1]

            if stk in stacks:
                raise OSError(f"Multiple stack={stk}")

            shapes = read_fov(fovdir, stk)
            obsids = [int(o) for o in obsids.split(",")]

            stacks[stk] = {"stack": stk,
                           "polygons": shapes,
                           "obsids": obsids}

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

    if len(sys.argv) != 4:
        sys.stderr.write(f"Usage: {sys.argv[0]} stack-list fovdir outfile\n")
        sys.exit(1)

    doit(sys.argv[1], sys.argv[2], sys.argv[3])
