#!/usr/bin/env python

"""
Usage:

  ./identify_stacks_outlines.py directory

Aim:

Create the outline data. The idea is that we combine the FOV
outline (reduced fidelity as we don't really need sub-arcsecond
resolution) along with some generic stack information.

The output is written to stdout, expected to be saved to

  wwt21_outlines_base.js

Notes
-----

For historical reason, we generate a dictionary with only
the stacks keys, which contains a list of dictionaries, one
for each stack. Each stack dictionary contains the fields

    stackid
    nobs       - the number of obis
    descripton - "The stack contains <n> <inst> observation(s)."
    polygons   - list of coordinate pairs to 6 dp (or so)

It's not an ideal set-up

  a) as the stacks get processed the coordinates will need to
     be updated, and there's no way to avoid re-downloading all
     the data
  b) most of the fields can actually be created given the existing
     data we know about

"""

from pathlib import Path
import sys

import stackdata


def process(indir):
    """Read in the stack data."""

    stacks = stackdata.find_stack_obis(indir)

    # Write out (really should be JSON but doint it this way for now).
    #
    print("var outlines = {")
    print('"stacks": [')
    spacer = ""
    for stack in sorted(stacks):
        print(f'{spacer}{{"stackid": "{stack}",')
        nobs = len(stacks[stack])
        print(f' "nobs": {nobs},')

        if stack.startswith('acisfJ'):
            inst = "ACIS"
        elif stack.startswith('hrcfJ'):
            inst = "HRC"
        else:
            raise ValueError(f"UNKNOWN stack: '{stack}")

        if nobs == 1:
            count = "one"
            suffix = ""
        else:
            if nobs == 2:
                count = "two"
            elif nobs == 3:
                count = "three"
            elif nobs == 4:
                count = "four"
            elif nobs == 5:
                count = "five"
            elif nobs == 6:
                count = "six"
            elif nobs == 7:
                count = "seven"
            elif nobs == 8:
                count = "eight"
            elif nobs == 9:
                count = "nine"
            else:
                count = nobs

            suffix = "s"

        desc = f"The stack contains {count} {inst} observation{suffix}."
        print(f' "description": "{desc}",')
        print(f' "polygons": [')

        print(' ]}')
        spacer = ","

    print("]};")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory\n")
        sys.exit(1)

    process(Path(sys.argv[1]))
