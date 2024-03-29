#!/usr/bin/env python

"""
Usage:

  ./ens2json infile

Aim:

Create useful information about ensembles in JSON format. This is intended
for internal/CXC use, so there is no guarantee on the format of if this
information is valid. Output is to the screen.

"""

import json

from stk import build
from coords.utils import calculate_nominal_position


def stk2coord(stack):
    """Get the stack center from the name

    With the changes in CSC 2.1 the position may no longer be
    "correct", but it should be good enough for our purposes.

    """

    assert stack.startswith('acisfJ') or stack.startswith('hrcfJ'), \
        stack
    assert stack.endswith('_001') or stack.endswith('_002'), stack

    idx = stack.find('J')
    cstr = stack[idx + 1:-4]

    sign = cstr[7]
    assert sign in "mp", stack
    rstr = cstr[:7]
    dstr = cstr[8:]

    rah = int(rstr[0:2])
    ram = int(rstr[2:4])
    ras = int(rstr[4:]) / 10
    ra = 15.0 * (rah + (ram + (ras / 60.0)) / 60.0)

    decd = int(dstr[0:2])
    decm = int(dstr[2:4])
    decs = int(dstr[4:])
    dec = decd + (decm + (decs / 60.0)) / 60.0

    if sign == 'm':
        dec *= -1

    return [ra, dec]


def coords2center(cs):
    """Convert a list of ra,dec values to a 'center'

    Just "average" the positions, but we do have at least one
    ensemble which straddles ra=0/360, so can not employ a
    cartesian approximation.

    Parameters
    ----------
    cs : sequence of (ra, dec) pairs
        The RA and Dec values are in decimal degrees

    Returns
    -------
    obj : dict
        Has keys ra and dec

    """

    ras = [p[0] for p in cs]
    decs = [p[1] for p in cs]
    ra, dec = calculate_nominal_position(ras, decs)
    return {'ra': ra, 'dec': dec}


def clean(ensemble):
    """Grab the actual ensemble value.

    This makes it a little easier for me downstream.
    """

    assert ensemble.startswith('ens'), ensemble
    assert ensemble.endswith('00_001') or ensemble.endswith('00_002'), ensemble
    return int(ensemble[3:-6])


def convert_old(infile):

    store = {}
    coords = []
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 4, l
            nstk = int(toks[1])
            ctr = int(toks[2])
            stk = toks[3]

            if ctr == 1:
                assert coords == []

            coords.append(stk2coord(stk))

            if ctr == nstk:
                center = coords2center(coords)
                ens = clean(toks[0])
                store[ens] = center
                coords = []

    assert coords == []
    print(json.dumps(store))


def convert(infile):

    store = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 3, l
            assert toks[1] in ["NEW", "OLD"], toks[1]

            stks = build(toks[2])
            coords = [stk2coord(stk) for stk in stks]
            center = coords2center(coords)
            ens = clean(toks[0])
            store[ens] = center
            store[ens]["nstacks"] = len(stks)

    print(json.dumps(store))


if __name__ == "__main__":

    import sys
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: {} infile\n".format(sys.argv[0]))
        sys.exit(1)

    convert(sys.argv[1])
