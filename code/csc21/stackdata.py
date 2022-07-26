"""
Handle stack/obi/name mapping for CSC 2.1.

Requires:

  csc20_detect_stack_obi.lis
  cxc_obsid_targetname.lis

  <indir>/{acis|hrc}_stacks_{uncnaged|updated|new}.lis

"""


from collections import defaultdict
import subprocess as sbp
import time
import xml.etree.ElementTree as ET


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


def get_stack_numbers():
    """What are the number of sources for each stack?

    We should be able to do this with ADQL but I am not sure how,
    so just read in the data and do the calculation in Python.

    Note that this is being run later than when the status data
    was processed, so it may contain extra stacks.

    We cold do this with pyvo but I am trying to make this easy to
    run from a generic work machine, so we use curl unstead.
    """

    print("-> start stack count")
    tstart = time.time()
    proc = sbp.run(["curl",
                    "--silent",
                    "--request", "POST",
                    "--location",
                    "--data", "REQUEST=doQuery",
                    "--data", "PHASE=RUN",
                    "--data", "FORMAT=text",
                    "--data", "LANG=ADQL",
                    "--data", "QUERY=SELECT distinct a.name, a.detect_stack_id from csc21_snapshot.master_stack_assoc a",
                    "https://cda.cfa.harvard.edu/csc21_snapshot_tap/sync"],
                   check=True, stdout=sbp.PIPE)

    tend = time.time()
    print(f"<- took {tend - tstart:.1f} seconds")

    stacks = defaultdict(int)
    header = True
    for l in proc.stdout.decode().split("\n"):
        if header:
            if l.startswith("#"):
                continue

            if l != "name\tdetect_stack_id":
                raise ValueError(l)

            header = False
            continue

        if l == "":
            continue

        toks = l.split("\t")
        assert len(toks) == 2, l
        stacks[toks[1]] += 1

    # remove default nature (so we know what stacks are not known)
    #
    out = {}
    for stack, count in stacks.items():
        out[stack] = count

    return out


def roundy(v, n):
    """Restrict to n decimal places.

    Up to the vagueris of floating-point representation.

    And have decided not to do this, so it just returns the
    input value.
    """

    """
    t = 10**n
    return math.floor(v * t + 0.5) / t
    """

    return v


def unitify(unitstr):
    """Try and clean up the units string"""

    # Not sure of the encoding rules
    if unitstr.startswith('["'):
        unitstr = unitstr[2:]

    if unitstr.endswith(']"'):
        unitstr = unitstr[:-2]

    unitstr = unitstr.strip()
    if unitstr == '':
        return None
    else:
        return unitstr


# Convert F(ALSE) and T(RUE) to 0 and 1 respectively
def convert_to_bool(v):
    v = v.strip()
    if v == 'F':
        return 0
    elif v == 'T':
        return 1
    else:
        raise ValueError("FLAG = <{}>".format(v))


def convert_to_int(v):
    v = v.strip()

    if v == '':
        return -999

    out = int(v)
    if out < 0:
        print(v)

    return out


def convert_to_float(v):
    if v is None:
        return None

    v = v.strip()
    if v == '':
        # return math.nan
        return None

    return float(v)


def make_convertor(name, dtype):
    """For VOTABLE we have boolean, char, double, int"""

    # The spaces may be important in the strings, but don't think
    # they are for my use case, so remove them.
    #
    if dtype == 'char':
        if name.endswith('_flag'):
            return convert_to_bool
        else:
            return lambda v: v.strip()
    elif dtype == 'int':
        return convert_to_int
    elif dtype == 'double':
        return convert_to_float
    elif dtype == 'boolean':
        return convert_to_bool
    else:
        raise ValueError(dtype)


def add_convertor(metadata):
    """Add the appropriate convertor function"""

    metadata["convertor"] = make_convertor(metadata["name"],
                                           metadata["datatype"])


def srclist_update_store(store, row):
    """Add the column data to the store.

    Special case handling for flux_aper_[b/w] and the _lolim/_hilim
    variants.

    Extended sources (those ending in X) are skipped as they only
    have a subset of the data we care about and I don't have the
    energy to work in this just now.
    """

    toks = [r.text for r in row.findall('{http://www.ivoa.net/xml/VOTable/v1.2}TD')]
    assert len(toks) == len(store["order"])

    # need to "down convert" the fluxes
    rowdata = dict(list(zip(store['order'], toks)))

    # Skip extended sources
    if rowdata['name'].endswith("X"):
        return

    fb = rowdata['flux_aper_b']
    fw = rowdata['flux_aper_w']

    # Just cheking what the value is as dealing with different
    # versions of the table (text/tsv vs VOTABLE)
    #
    if fb is not None and fb.strip() == '':
        print(rowdata['name'])
        fb = None

    if fw is not None and fw.strip() == '':
        print(rowdata['name'])
        fw = None

    if fb is not None and fw is not None:
        print("WARNING: {} has fb=[{}] fw=[{}]".format(name,
                                                       fb,
                                                       fw))

    # extract flux values here, not in loop
    if fb is not None:
        # band = 'broad'
        band = 0
        flux = fb  # rowdata['flux_aper_b']
        fluxlo = rowdata['flux_aper_lolim_b']
        fluxhi = rowdata['flux_aper_hilim_b']
    elif fw is not None:
        # band = 'wide'
        band = 1
        flux = fw  # rowdata['flux_aper_w']
        fluxlo = rowdata['flux_aper_lolim_w']
        fluxhi = rowdata['flux_aper_hilim_w']
    else:
        # band = ''
        band = -1
        flux = None
        fluxlo = None
        fluxhi = None

    flux = convert_to_float(flux)
    fluxlo = convert_to_float(fluxlo)
    fluxhi = convert_to_float(fluxhi)

    # row = {}
    row = []

    # Ugh: trying to be generic but also re-ordering/naming the columns.
    #
    for col, val in zip(store['order'], toks):
        assert col not in row  # not sure this is even meaningful anymore

        # We assume the fluxes are in a set order so when we
        # hit the first one we can replace with our
        # Need to handle conversion of flux values
        #
        if col == 'flux_aper_b':
            row.extend([band, flux, fluxlo, fluxhi])

        # Can skip the flux columns as already handled.
        #
        if col.startswith('flux_aper'):
            continue

        try:
            val = store["metadata"][col]["convertor"](val)
        except ValueError:
            print("Unable to convert '{}'".format(val))

        if col == 'ra':
            val = roundy(val, 4)
        elif col == 'dec':
            val = roundy(val, 5)

        # row[col] = val
        row.append(val)

    store['rows'].append(row)


def srclist_process_votable(cts):

    print("-> start encoding source properties")
    tstart = time.time()

    root = ET.fromstring(cts)
    check = root.findall("./{http://www.ivoa.net/xml/VOTable/v1.2}RESOURCE/{http://www.ivoa.net/xml/VOTable/v1.2}INFO[@value='OK']")
    if len(check) != 1:
        # don't bother reporting more info until we need to
        raise ValueError("query was not OK")

    tbls = root.findall("./{http://www.ivoa.net/xml/VOTable/v1.2}RESOURCE/{http://www.ivoa.net/xml/VOTable/v1.2}TABLE[@name='results']")
    if len(tbls) != 1:
        # don't bother reporting more info until we need to
        raise ValueError(f"expected 1 table, found {len(tbls)}")

    tbl = tbls[0]
    fields = tbl.findall("{http://www.ivoa.net/xml/VOTable/v1.2}FIELD")
    datas = tbl.findall("{http://www.ivoa.net/xml/VOTable/v1.2}DATA")

    assert len(fields) == 25
    assert len(datas) == 1

    names = []
    metadata = {}
    for field in fields:
        name = field.attrib["name"]
        names.append(name)

        mdata = {
            "name": name,
            "datatype": field.attrib["datatype"]
        }

        # we currently don't make use of this null value, should we?
        # (I'm assuming we don't have any null values in the data...)
        #
        if field.attrib["datatype"] == "int":
            try:
                mdata["null"] = int(field.findall("{http://www.ivoa.net/xml/VOTable/v1.2}VALUES[@null]")[0].attrib["null"])
            except IndexError:
                pass

        add_convertor(mdata)
        metadata[name] = mdata

    store = {"metadata": metadata, "rows": [], "order": names}

    data = datas[0]
    for row in data.findall("{http://www.ivoa.net/xml/VOTable/v1.2}TABLEDATA/{http://www.ivoa.net/xml/VOTable/v1.2}TR"):
        srclist_update_store(store, row)

    # We need to re-order the column names as we have mangled
    # them.
    #
    cnames = []
    for col in store["order"]:

        if col == 'flux_aper_b':
            cnames.extend(["fluxband", "flux", "flux_lolim", "flux_hilim"])

        # Can skip the flux columns as already handled.
        #
        if col.startswith('flux_aper'):
            continue

        cnames.append(col)

    store["order"] = cnames

    tend = time.time()
    print(f"<- took {tend - tstart:.1f} seconds")

    assert len(store["rows"]) > 0
    return store


def get_source_properties():
    """What are the current source properties?

    This follows the CSC 2.0 props2json.py code but we don't have a
    "prerelease" source list to marry up with. In 2.0 we used the
    getProperties endpoint but now using TAP we don't get the same TSV
    output, so use VOTABLE instead.

    Note that this is being run later than when the status data
    was processed, so it may contain extra stacks.

    We cold do this with pyvo and astropy but I am trying to make this
    easy to run from a generic work machine, so we use curl unstead.

    Note: we EXCLUDE the extended sources but only in post processing

    """

    print("-> start source properties")
    tstart = time.time()
    proc = sbp.run(["curl",
                    "--silent",
                    "--request", "POST",
                    "--location",
                    "--data", "REQUEST=doQuery",
                    "--data", "PHASE=RUN",
                    "--data", "FORMAT=votable",
                    "--data", "LANG=ADQL",
                    "--data", "QUERY=SELECT DISTINCT m.name,m.ra,m.dec,m.err_ellipse_r0,m.err_ellipse_r1,m.err_ellipse_ang,m.conf_flag,m.sat_src_flag,m.acis_num,m.hrc_num,m.var_flag,m.significance,m.flux_aper_b,m.flux_aper_lolim_b,m.flux_aper_hilim_b,m.flux_aper_w,m.flux_aper_lolim_w,m.flux_aper_hilim_w,m.nh_gal,m.hard_hm,m.hard_hm_lolim,m.hard_hm_hilim,m.hard_ms,m.hard_ms_lolim,m.hard_ms_hilim FROM csc21_snapshot.master_source m ORDER BY name ASC",
                    "https://cda.cfa.harvard.edu/csc21_snapshot_tap/sync"],
                   check=True, stdout=sbp.PIPE)

    tend = time.time()
    print(f"<- took {tend - tstart:.1f} seconds")

    return srclist_process_votable(proc.stdout.decode())
