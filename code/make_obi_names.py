#!/usr/bin/env python

"""
Usage:

  ./make_obi_list.py

Aim:

Create a JSON file giving the names of the obis used in a stack.
Since there can be multiple observations with the same name,
duplicates are removed.

  stacks.pd2.txt
  obsids.dat

Output is to stdout.


"""


def get_obsids(infile='stacks.pd2.txt'):
    """Strips out the obi values from the obsids, since they
    do not help here."""

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

            obsids = set([int(o[:5]) for o in obis])
            store[stack] = obsids

    return store


def get_names(infile='obsids.dat'):

    store = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split('\t')
            assert len(toks) == 2, l

            obsid = int(toks[0])
            name = toks[1]

            assert obsid not in store
            store[obsid] = name

    return store


def doit(progname):

    stacks = get_obsids()
    obsid_store = get_names()

    print("var stack_name_map = {")
    first = True
    for stack, obsids in stacks.items():

        stack_names = set([])
        stack_names_check = set([])
        for obsid in obsids:
            try:
                name = obsid_store[obsid]
            except KeyError:
                continue

            # Strip out trailing "[...]" values as no use here,
            # but only when the name ends with ']', as there
            # are names like '[RC2] ...'. Also have some that
            # end '[N206]' and '[N9]' which we don't want to remove.
            # So special case for the calib targets that we want this
            # to happen.
            #
            lpos = name.find('[')
            if lpos > -1:
                lname = name[:lpos].strip()
                if lname in ['E0102-72', 'E0102-72.3',
                             'G21.5-0.9', 'G21.5-09',
                             'CAS A', 'Cas A']:
                    name = lname

            # can have different capitalisations of a
            # name, so just use the first we come across
            # (rather than try a complex selection rule to
            # prefer ArLac to ARLAC). Similarly, remove
            # white space to avoid 1RXJ1712, 1RX J1712,
            # and 1RXJ 1712.
            #
            # Could try and keep the longest name (to keep in
            # spaces, in the assumption that they are more
            # readable), but not sure worth it.
            #
            check_name = name.lower()
            check_name = "".join([n for n in check_name if n != ' '])
            if check_name in stack_names_check:
                continue

            stack_names.add(name)
            stack_names_check.add(check_name)

        if len(stack_names) == 0:
            sys.stderr.write("Skipping {}  {}\n".format(stack,
                                                        obsids))
            sys.stderr.flush()
            continue

        if first:
            first = False
        else:
            sys.stdout.write(',')

        # Order names by length
        ostr = sorted(['"{}"'.format(n) for n in stack_names],
                      key=lambda x: len(x))
        sys.stdout.write('"{}": [{}]'.format(stack, ",".join(ostr)))

        sys.stdout.write('\n')

    print("};")


if __name__ == "__main__":

    import sys
    if len(sys.argv) != 1:
        sys.stderr.write("Usage: {}\n".sys.argv[0])
        sys.exit(1)

    doit(sys.argv[0])
