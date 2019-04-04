#!/usr/bin/env python

"""
Usage:

  ./make_obi_list.py

Aim:

Create a JSON file giving the obis in each stack.

  stacks.pd2.txt

Output is to stdout.

"""


def read_obis(infile='stacks.pd2.txt'):

    store = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 8, l
            stack = toks[0]
            assert stack not in store

            nobis = int(toks[6])
            obis = toks[7].split(',')
            assert nobis == len(obis), l

            store[stack] = obis

    return store


def doit(progname):

    store = read_obis()

    print("var obi_map = {")
    first = True
    for stack, obis in store.items():
        if first:
            first = False
        else:
            sys.stdout.write(',')
        ostr = ['"{}"'.format(o) for o in obis]
        sys.stdout.write('"{}": [{}]'.format(stack, ",".join(ostr)))

        sys.stdout.write('\n')

    print("};")


if __name__ == "__main__":

    import sys
    if len(sys.argv) != 1:
        sys.stderr.write("Usage: {}\n".sys.argv[0])
        sys.exit(1)

    doit(sys.argv[0])
