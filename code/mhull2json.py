#!/usr/bin/env python

"""
Usage:

  ./mhull2json.py infiles outfile

Aim:

Create a simple JSON representation of the master hulls. At present
there is no ordering/labelling.

"""


import json
import numpy as np

import pycrates


def read_mhull(infile):
    """Can have multiple hulls in a file."""

    cr = pycrates.read_file("{}[HULLLIST]".format(infile))
    assert cr.get_nrows() > 0, infile

    mids = cr.Master_Id.values
    nvs = cr.NVERTEX.values
    eqpos = cr.EQPOS.values

    # turns out the nvertex value is not to be trusted
    #
    out = []
    for (mid, nv, eqp) in zip(mids, nvs, eqpos):

        ra = eqp[0]
        dec = eqp[1]

        xidx = np.isfinite(ra)
        yidx = np.isfinite(dec)
        assert (xidx == yidx).all(), infile

        if xidx.sum() == 0:
            print("No valid data for {} mid={}".format(infile, mid))
            continue
        elif xidx.sum() < 3:
            print("Missing vertices for {} mid={}".format(infile, mid))
            continue

        ra = ra[xidx]
        dec = dec[xidx]

        if (ra[-1] != ra[0]) or (dec[-1] != dec[0]):
            print("WARNING: not closed {} mid={}".format(infile, mid))

        # convert to a regular python array
        pos = []
        for x, y in np.vstack((ra, dec)).T:
            pos.append([x, y])

        out.append(pos)

    return out


def process(infiles, outfile):

    store = []
    for infile in infiles:
        for hull in read_mhull(infile):
            store.append(hull)

    with open(outfile, 'w+') as fh:
        fh.write(json.dumps(store))

    print("Created: {}".format(outfile))



if __name__ == "__main__":

    import sys
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: {} infiles outfile\n".format(sys.argv[0]))
        sys.exit(1)

    import stk
    infiles = stk.build(sys.argv[1])
    process(infiles, sys.argv[2])
