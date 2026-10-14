#!/usr/bin/env python

"""
Usage:
  ./make_wwt22_counts.py

Aim:

Create the wwt22_counts.js file. I have since decided I want this
information stored in the stack data, but leave this code as is,
as it's easier to parse the output of this file rather than re-run
it (as it's slow, ~ 1 hour, thanks to being highly unoptimized).

Needs:

  stack_obsid_obi_name.dat

"""

import sys

import pyvo as vo

import pycrates


def read_stacks() -> list[str]:
    """What are the stack names?

    The result is sorted.
    """

    cr = pycrates.read_file("stack_obsid_obi_name.dat[cols stack]")
    stacks = cr.get_column("stack").values
    return sorted(set(stacks))


def get_stack_numbers(srv,
                      stack: str) -> int:
    """What are the number of sources for each stack?

    We should be able to do this with ADQL but I am not sure how,
    so just read in the data and do the calculation in Python.

    Argh: with CSC 2.2 (and using pyvo) I see the data is being limited
    by the maxrec value of 1e5. So we need to page this. So be simple
    and change this into a query by stack

    """

    out = srv.search(f"SELECT distinct a.name, a.detect_stack_id from csc_snapshot.master_stack_assoc a WHERE a.detect_stack_id = '{stack}'")
    return len(out)


def doit() -> None:

    stacks = read_stacks()
    print(f"Processing {len(stacks)} stacks")

    outfile = "wwt22_counts.js";
    srv = vo.dal.TAPService('https://cda.cfa.harvard.edu/csc_snapshot_tap')

    with open(outfile, mode="wt") as ofh:
        ofh.write("var stack_count = {\n")

        sep = ""
        for stack in stacks:
            ofh.write(f'{sep}"{stack}": ')
            ofh.write(str(get_stack_numbers(srv, stack)))
            ofh.write('\n')
            sep = ","
            ofh.flush()

        ofh.write("};\n")

    print(f"Created: {outfile}")


if __name__ == "__main__":
    if len(sys.argv) != 1:
        sys.stderr.write(f"Usage: {sys.argv[0]}\n")
        sys.exit(1)

    doit()
