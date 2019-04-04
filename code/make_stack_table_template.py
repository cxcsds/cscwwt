#!/usr/bin/env python

"""
Usage:

  ./make_stack_table_template.py

Aim:

Create template XMl for the stack table page. It requires

  stacks.pd2.txt
  /data/L3/report_page/completed_ensembles.txt

Output is to stdout.

"""


def read_stacks(infile='stacks.pd2.txt'):
    out = {}
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            assert len(toks) == 8, l

            stack = toks[0]
            assert stack not in out, stack

            nobs = int(toks[6])
            obis = toks[7].split(',')
            assert nobs == len(obis), l

            out[stack] = {'obis': obis, 'stackid': stack}

    return out


def augment_stacks(stacks,
                   infile='/data/L3/report_page/completed_ensembles.txt'):

    ensembles = set([])
    with open(infile, 'r') as fh:
        for l in fh.readlines():
            l = l.strip()
            if l == '' or l.startswith('#'):
                continue

            toks = l.split()
            if toks[0] == 'ensemble':
                assert len(toks) == 6
                assert toks[1] == 'cohorts', l
                assert toks[4] == 'complete', l
                continue

            assert len(toks) in [6, 7], l
            ensemble = toks[0]
            assert ensemble not in ensembles, l
            ensembles.add(ensemble)

            complete = toks[4] == 'True'

            for stackid in toks[1].split(','):
                store = stacks[stackid]
                assert 'complete' not in store
                store['complete'] = complete
                store['ensemble'] = ensemble

    for v in stacks.values():
        if 'complete' not in v:
            raise RuntimeError(str(v))

    return ensembles


def dump_ensemble(n, ens_stacks, odd=True):
    """Need to track even/odd counting here rather than in CSS
    because of the use of rowspan here.
    """

    nstack = len(ens_stacks)
    proc = ens_stacks[0]['complete']
    if odd:
        rowclass = 'odd'
    else:
        rowclass = 'even'

    print("<tr class='{}'>".format(rowclass))
    print("<td rowspan='{}'>{}</td>".format(nstack, proc))
    print("<td class='count' rowspan='{}'>{}</td>".format(nstack,
                                                          n))
    first = True
    for stk in ens_stacks:
        if first:
            first = False
        else:
            print("<tr class='{}'>".format(rowclass))

        print("<td id='{0}'>{0}</td>".format(stk['stackid']))
        print("<td class='stack'>{}</td>".format(len(stk['obis'])))

        tgs = []
        for obi in stk['obis']:
            obsid = int(obi[:5])
            tgs.append('<extlink href="http://cda.cfa.harvard.edu/chaser/startViewer.do?menuItem=details&amp;obsid={}">{}</extlink>'.format(obsid, obi))

        print("<td>{}</td>".format(", ".join(tgs)))
        print("</tr>")


def dump_table_head():
    print("<table class='csctable'>")
    print("<thead><tr>")
    print("<th colspan='2'>Ensemble</th>")
    print("<th colspan='3'>Stack</th>")
    print("</tr><tr>")
    print("<th>Complete</th>")
    print("<th>Number of observations</th>")
    print("<th>Identifier</th>")
    print("<th>Number of observations</th>")
    print("<th>Observation names</th>")
    print("</tr></thead>")
    print("<tbody>")


def dump_table_foot():
        print("</tbody></table>")


def dump_template(ensembles, stacks):

    # arrange list by ensembles, but sort the ensembles by the
    # number of obsids in each ensemble
    #
    store = {}
    for stack in stacks.values():
        ensemble = stack['ensemble']
        try:
            store[ensemble].append(stack)
        except KeyError:
            store[ensemble] = [stack]

    order = {}
    for ensemble, slist in store.items():
        nobs = sum([len(s['obis']) for s in slist])

        try:
            order[nobs].append(ensemble)
        except KeyError:
            order[nobs] = [ensemble]

    nmax = 10
    nkeys = sorted(order.keys())
    first = [n for n in nkeys if n <= nmax]
    last = [n for n in nkeys if n > nmax]

    def get_title(n):
        if n == 1:
            ext = ''
        else:
            ext = 's'

        lbl = "Ensembles containing {} observation{}".format(n, ext)
        return 'obs{}'.format(n), lbl

    def get_final_title():
        lbl = 'Ensembles containing more than {} observations'.format(nmax)
        return 'obsrest', lbl

    # TOC
    #
    print("<list>")
    for n in first:
        idname, title = get_title(n)
        print("<li><cxclink href='#{}'>{}</cxclink></li>".format(idname, title))

    idname, title = get_final_title()
    print("<li><cxclink href='#{}'>{}</cxclink></li>".format(idname, title))
    print("</list>")

    print("<hr/>")

    for n in first:

        idname, title = get_title(n)
        print("<h3 id='{}'>{}</h3>".format(idname, title))

        nens = len(order[n])
        nproc = sum([1 for e in order[n] if store[e][0]['complete']])

        print("<p>There are {} ensembles, {} ".format(nens, nproc))
        print("of which have completed processing.</p>")

        dump_table_head()
        odd = True
        for ensemble in order[n]:
            dump_ensemble(n, store[ensemble], odd=odd)
            odd = not odd

        dump_table_foot()

    idname, title = get_final_title()
    print("<h3 id='{}'>{}</h3>".format(idname, title))

    nens = sum([len(order[n]) for n in last])
    nproc = sum([sum([1 for e in order[n] if store[e][0]['complete']])
                 for n in last])

    print("<p>There are {} ensembles, {} ".format(nens, nproc))
    print("of which have completed processing.</p>")

    dump_table_head()
    odd = True
    for n in last:
        for ensemble in order[n]:
            dump_ensemble(n, store[ensemble], odd=odd)
            odd = not odd

    dump_table_foot()


def doit(progname):

    stacks = read_stacks()
    ensembles = augment_stacks(stacks)

    print('<?xml version="1.0" encoding="utf-8" ?>')
    print("<!DOCTYPE dpagehtml>")
    print("<page>")
    print("<!-- THIS FILE IS AUTO-GENERATED: SEE {} -->".format(progname))
    print(" <info>")
    print("  <title>")
    print("   <short>Cohorts and Ensembles in CSC 2.0</short>")
    print("  </title>")
    print("  <navbar>main</navbar>")
    print("  <version>2.0</version>")
    print("  <css>")
    # over-ride CSS table for odd/even rows
    print("table.csctable tbody tr:nth-child(odd) { background: 0; }")
    print("table.csctable tbody tr.odd { background: rgba(204, 204, 204, 0.7); }")
    print("  </css>")
    print(" </info>")
    print(" <text>")
    dump_template(ensembles, stacks)
    print(" </text>")
    print("</page>")


if __name__ == "__main__":

    import sys
    if len(sys.argv) != 1:
        sys.stderr.write("Usage: {}\n".sys.argv[0])
        sys.exit(1)

    doit(sys.argv[0])
