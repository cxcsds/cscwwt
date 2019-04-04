#!/usr/bin/env python

"""
Usage:

  ./template_to_json.py stacks json_template

Aim:

Update the template with the current processing status in the
stacks file, which is expected to have two columns

   stackid  bool

where bool is True or False. The json_template is the file
created by make_json_template.py

The output is to the screen.

"""

import sys


def read_stacks(infile):

    stacks = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 2, l
            assert toks[1] in ['True', 'False'], l
            assert toks[0] not in stacks, l

            stacks[toks[0]] = toks[1] == 'True'

    return stacks


def convert(stackfile, templatefile):

    stacks = read_stacks(stackfile)
    with open(templatefile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()

            # TODO - also update LASTMODIFIED and NSTACK_...

            start = l.find('"PROCSTATUS_')
            if start == -1:
                print(l)
                continue

            end = l.find('",', start)
            assert end > 0

            left = l[:start]
            right = l[end + 1:]

            stack = l[start + 12:end]
            assert stack in stacks

            """
            if stack.startswith('acisfJ'):
                inst = 'ACIS'
            elif stack.startswith('hrcfJ'):
                inst = 'HRC'
            else:
                raise IOError(l)

            if stacks[stack]:
                extra = ''
            else:
                extra = '_unobserved'

            print("{}stack_{}{}{}".format(left, inst, extra, right))
            """

            if stacks[stack]:
                lbl = 'true'
            else:
                lbl = 'false'

            print("{}{}{}".format(left, lbl, right))


if __name__ == "__main__":

    if len(sys.argv) != 3:
        sys.stderr.write("Usage: {} stacks template\n".format(sys.argv[0]))
        sys.exit(1)

    convert(sys.argv[1], sys.argv[2])
