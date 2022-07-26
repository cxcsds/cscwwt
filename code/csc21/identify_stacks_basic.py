#!/usr/bin/env python

"""
Usage:

  ./identify_stacks_basic.py directory

Aim:

Create "basic" stack information for the CSC 2.1 website:

  stackid
  obis
  names
  stacktype: unchanged, updated, new (relative to CSC 2.0)

The names do not quite match the CSC database, as we are using
the updated names whereas the CSC 2.0-era stacks will be using
their original names, but I am not sure it's worth the effort of
matching CSC exactly here.

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

  wwt21_stacks.json

Notes
-----

We use the detect_stack table as this does not suffer from the
"need a detection" case - that is, it should list all the data.

We can do

curl --request POST --location --data REQUEST=doQuery --data PHASE=RUN --data FORMAT=TEXT --data LANG=ADQL --data 'QUERY=select * FROM csc2.detect_stack o' http://cda.cfa.harvard.edu/csc2tap/sync

which returns

  detect_stack_id
  obsid
  obi
  cycle         (may be empty, P, or S, although apparently always empty)

although note that this is for CSC 2.0.

"""

from pathlib import Path
import sys

import stackdata


def process(indir):
    """Read in the stack data."""

    stacks = stackdata.find_stack_obis(indir)
    status = stackdata.find_stack_status(indir)
    targets = stackdata.read_cxc_targetnames()

    obi20 = stackdata.read_20_stacklist()

    def nice(obi):
        return f'"{obi[0]:05d}_{obi[1]:03d}"'

    # Could write out via json.dumps but this way we can make it
    # a bit-more readable, which is useful for development.
    #
    print("{")
    spacer = ""
    for stack in sorted(stacks):
        obsids = set(obi[0] for obi in stacks[stack])
        names = set(f'"{targets[obsid]}"' for obsid in obsids)

        obis = [nice(obi) for obi in stacks[stack]]
        print(f'{spacer}"{stack}": {{')

        stacktype = status[stack]

        print(f'"stacktype": "{stacktype}"')
        print(f',"obsids": [{",".join(obis)}]')
        print(f',"names": [{",".join(names)}]')

        # For updated fields we want to note down what obsids are new.
        # We could also identify the "new" names, but as the names
        # are "in flux" between 2.0 and 2.1 let's not bother
        #
        if stacktype == "updated":

            assert stack.endswith("_002")
            oldstack = stack[:-4] + "_001"

            assert len(obi20[oldstack]) > 0

            oldobis = set(nice(obi) for obi in obi20[oldstack])
            newobis = list(sorted(set(obis).difference(oldobis)))

            assert len(newobis) > 0, stack
            assert len(oldobis.difference(set(obis))) == 0, stack

            print(f',"new_obsids": [{",".join(newobis)}]')

        print('}')
        spacer = ","

    print("}")


if __name__ == "__main__":

    if len(sys.argv) != 2:
        sys.stderr.write(f"Usage: {sys.argv[0]} directory\n")
        sys.exit(1)

    process(Path(sys.argv[1]))
