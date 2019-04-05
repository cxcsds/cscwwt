#!/usr/bin/env python

"""
Usage:

  ./mhull2json.py infiles outfile

Aim:

Create a simple JSON representation of the master hulls. At present
there is no ordering/labelling.

Data format:
  list of hulls
  each hull is a list of 2 elements
    boolean (True if version>1)
    list of coordinate pairs (ra,dec in decimal degrees)

There can be multiple mhull files for a given ensemble. The highest
version is used (this slows things down a bit).

"""


import json
import numpy as np

import pycrates


def get_ensemble(infile):
    """What is the ensemble and revision of a mhull file?"""

    # For now rely on the header, and hope they have been updated
    #
    cr = pycrates.read_file(infile)
    ensemble = cr.get_key_value('ENSEMBLE')
    chsver = cr.get_key_value('CHSVER')
    if ensemble is None:
        raise IOError("Missing ENSEMBLE in {}".format(infile))
    if chsver is None:
        raise IOError("Missing CHSVER in {}".format(infile))

    # it should be an int, but just in case
    try:
        chsver = int(chsver)
    except ValueError:
        raise IOError("CHSVER is not an in in {}".format(infile))

    return (ensemble, chsver)


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

    norig = len(infiles)
    print("# Input is {} files".format(norig))

    # check on duplicates
    #
    store = {}
    for infile in infiles:
        ensemble, ver = get_ensemble(infile)
        try:
            oldver, oldfile = store[ensemble]
            if ver > oldver:
                store[ensemble] = (ver, infile)
            elif ver == oldver:
                raise IOError("same version: {} {}".format(oldfile, infile))

        except KeyError:
            store[ensemble] = (ver, infile)


    nrun = len(store)
    if nrun < norig:
        print("# Lost {} files due to repeats".format(norig - nrun))
    elif nrun > norig:
        raise RuntimeError("Loopy!")

    print("# Starting")
    coords = []
    for ver, infile in store.values():
        # original should be version=1
        changed = ver > 1
        for hull in read_mhull(infile):
            coords.append(hull)

    with open(outfile, 'w+') as fh:
        fh.write(json.dumps(coords))

    print("Created: {}".format(outfile))



if __name__ == "__main__":

    import sys
    if len(sys.argv) != 3:
        sys.stderr.write("Usage: {} infiles outfile\n".format(sys.argv[0]))
        sys.exit(1)

    import stk
    infiles = stk.build(sys.argv[1])
    process(infiles, sys.argv[2])
