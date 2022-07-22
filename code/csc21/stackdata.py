"""
Handle stack/obi/name mapping for CSC 2.1.

Requires:

  csc20_detect_stack_obi.lis
  cxc_obsid_targetname.lis

  <indir>/{acis|hrc}_stacks_{uncnaged|updated|new}.lis

"""


from collections import defaultdict


def read_20_stacklist():
    """Read in the CSC 2.0 stack/obi mapping.

    This was created with

    curl --request POST --location --data REQUEST=doQuery --data PHASE=RUN --data FORMAT=TEXT --data LANG=ADQL --data "QUERY=select o.detect_stack_id,o.obsid,o.obi FROM csc2.detect_stack o" http://cda.cfa.harvard.edu/csc2tap/sync > csc20_detect_stack_obi.lis
    """

    stacks = defaultdict(list)

    with open("csc20_detect_stack_obi.lis") as fh:
        header = True
        for l in fh.readlines():
            if l.startswith("#"):
                continue

            if header:
                assert l == "detect_stack_id\tobsid\tobi\n", f"<{l}>"
                header = False
                continue

            l = l.strip()
            if l == "":
                continue

            toks = l.split()
            assert len(toks) == 3

            stacks[toks[0]].append((int(toks[1]), int(toks[2])))

    for stack, obis in stacks.items():
        stacks[stack] = sorted(obis)

    return stacks


def read_cxc_targetnames():
    """Read in the data created by

    curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select distinct o.obs_id, o.target_name from ivoa.ObsCore o'   http://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis

    Used to be

    curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select o.obsid, o.target_name from cxc.observation o'   http://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis

    Note that we use ivoa.ObsCore and not cxc.observation because at the
    time of writing the cxc table has converted everything to upper case
    and removed all spaces from the target name field. However, the
    obscore table appears to have multiple rows per obsid, so
    we need a distinct clause.

    Unfortunately not all obsids in cxc.observation appear in
    ivoa.ObsCore. Why is this? There's 1408 missing obsids
    and it's not clear why they are being ignored: it's not
    new data as 17373 which was taken in 2015 is missing.
    Maybe it's the CAL observations. Nope, but it could be
    something like CAL + not-yet-observed?

    Because of this I've dumped obsid to target name from
    chandraobs to obsid-targets.tsv as a HACK.

    """

    targets = {}

    """
    with open("cxc_obsid_targetname.lis") as fh:
        header = True
        for l in fh.readlines():
            if l.startswith("#"):
                continue

            if header:
                assert l == "obsid\ttarget_name\n", f"<{l}>"
                header = False
                continue

            l = l.strip()
            if l == "":
                continue

            toks = l.split("\t")
            assert len(toks) == 2

            obsid = int(toks[0])
            assert obsid not in targets
            targets[obsid] = toks[1]
    """

    with open("obsid-targets.tsv") as fh:
        for l in fh.readlines():
            if l.startswith("#"):
                continue

            l = l.strip()
            if l == "":
                continue

            toks = l.split("\t")
            assert len(toks) == 2

            obsid = int(toks[0])
            assert obsid not in targets
            targets[obsid] = toks[1]

    return targets


def split_obi(obi):
    toks = obi.split("_")
    assert len(toks) == 2
    return (int(toks[0]), int(toks[1]))


def read_changed(infile):
    """Read in the data for new or updated stacks."""

    stacks = {}
    for l in infile.read_text().split("\n"):
        l = l.strip()
        if l == "" or l.startswith("#"):
            continue

        toks = l.split()
        assert len(toks) > 1
        assert toks[0] not in stacks

        obis = [split_obi(obi) for obi in toks[1].split(",")]
        stacks[toks[0]] = sorted(obis)

    return stacks


def read_unchanged(infile):
    """Read in the data for unchanged stacks."""

    stacks = set()
    for l in infile.read_text().split("\n"):
        l = l.strip()
        if l == "" or l.startswith("#"):
            continue

        assert len(l.split()) == 1

        assert l not in stacks
        stacks.add(l)

    return stacks


def find_stack_obis(indir):
    """Create the mapping from stack id to obis"""

    if not indir.is_dir():
        raise ValueError(f"'{indir} is not a directory")

    unchanged = set()
    stacks = {}
    nstacks = 0
    for inst in ["acis", "hrc"]:

        infile = indir / f"{inst}_stacks_unchanged.txt"
        unchanged |= read_unchanged(infile)

        for status in ["updated", "new"]:
            infile = indir / f"{inst}_stacks_{status}.txt"

            stackdata = read_changed(infile)
            n = len(stackdata)

            stacks |= stackdata
            if len(stacks) != (nstacks + n):
                raise OSError(f"multiple stacks with {infile} ??")

            nstacks = len(stacks)

    # I am *VERY* surprised we have mappings in stacks20 for all
    # elements in unchanged.
    #
    stacks20 = read_20_stacklist()
    for stack20 in unchanged:
        assert stack20 not in stacks
        stacks[stack20] = stacks20[stack20]

    return stacks


def find_stack_status(indir):
    """Is this new/updated/unchanged?

    Should have been part of find_stack_obis but I can't
    be bothered to retro-fit things.
    """

    if not indir.is_dir():
        raise ValueError(f"'{indir} is not a directory")

    stacks = {}
    for inst in ["acis", "hrc"]:

        infile = indir / f"{inst}_stacks_unchanged.txt"
        for stack in read_unchanged(infile):
            assert stack not in stacks
            stacks[stack] = "unchanged"

        for status in ["updated", "new"]:
            infile = indir / f"{inst}_stacks_{status}.txt"

            for stack in read_changed(infile):
                assert stack not in stacks
                stacks[stack] = status

    return stacks
