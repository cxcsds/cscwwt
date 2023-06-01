#!/usr/bin/env python

"""

Usage:

  ./cat2json.py cat

Aim:

Extract positions of XMM sources.

Positions are fixed to 4/5 decinmal places for RA and Dec
to save space (and this should be sub-arcsecond accuracy).

"""

import json
import math

import pycrates


def roundy(v, n):
    """Restrict to n decimal places.

    Up to the vagueris of floating-point representation.
    """

    t = 10**n
    return math.floor(v * t + 0.5) / t


def convert(infile):

    # fname = "{}[2][cols ra=sc_ra,dec=sc_dec]".format(infile)
    fname = "{}[2][cols ra,dec]".format(infile)

    cr = pycrates.read_file(fname)

    cat = cr.name

    srcs = []
    for ra,dec in zip(cr.RA.values,
                      cr.DEC.values):

        # ensure a Python not NumPy string, as want it to serialize
        # to JSON
        #
        # Restrict RA to 4dp and Dec to 5dp to try and save space
        # in the serialization (tihs should be sub-arcsecond
        # accuracy).
        #
        ra = roundy(ra, 4)
        dec = roundy(dec, 5)

        srcs.append([ra, dec])

    return {'catalog': cat, 'sources': srcs}


if __name__ == "__main__":

    import sys
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: {} cat\n".format(sys.argv[0]))
        sys.exit(1)

    out = convert(sys.argv[1])
    print(json.dumps(out))
