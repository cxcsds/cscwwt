#!/usr/bin/env python

"""
Usage:

  ./identify_stacks_obis.py directory

Aim:

We want to identify stacks with their component obis. This is
based on Ian's 2022-02-07 lists

  ian-2022-02-07/acis_stacks_new.txt
  ian-2022-02-07/acis_stacks_unchanged.txt
  ian-2022-02-07/acis_stacks_updated.txt
  ian-2022-02-07/hrc_stacks_new.txt
  ian-2022-02-07/hrc_stacks_unchanged.txt
  ian-2022-02-07/hrc_stacks_updated.txt

Requires:

  csc20_detect_stack_obi.lis

The output is written to stdout, expected to be saved to

  wwt21_obis.js

Notes
-----

Now, we can't easily find all stacks/obsids from the catalog as it doesn't
make it easy (possible?) to identify stacks with no detections.

We can do

curl --request POST --location --data REQUEST=doQuery --data PHASE=RUN --data FORMAT=TEXT --data LANG=ADQL --data 'QUERY=select * FROM csc2.detect_stack o' http://cda.cfa.harvard.edu/csc2tap/sync

which returns

  detect_stack_id
  obsid
  obi
  cycle         (may be empty, P, or S, although apparently always empty)

"""

from pathlib import Path
import sys

import stackdata


def process(indir):
    """Read in the stack data."""

    stacks = stackdata.find_stack_obis(indir)

    def nice(obi):
        return f'"{obi[0]:05d}_{obi[1]:03d}"'

    # Write out (really should be JSON but doint it this way for now).
    #
    print("var obi_map = {")
    spacer = ""
    for stack in sorted(stacks):
        obis = [nice(obi) for obi in stacks[stack]]
        print(f'{spacer}"{stack}": [{",".join(obis)}]')
        spacer = ","

    print("};")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory\n")
        sys.exit(1)

    process(Path(sys.argv[1]))
