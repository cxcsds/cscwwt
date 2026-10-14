# CSC 2.2

Can we modify the existing code for CSC 2.2?

The stacks in CSC 2.2 labelled by ensemble:

% cp /data/L3/tap/xfer/ens_stk_csc22.txt .

How do we get the mapping

  stack obsid obi

This can be done with a query, but only for those stacks with sources!

curl --request POST \
  --location \
  --data REQUEST=doQuery \
  --data PHASE=RUN \
  --data FORMAT=votable \
  --data LANG=ADQL \
  --data 'QUERY=SELECT d.detect_stack_id, d.obsid, d.obi FROM csc21.detect_stack d' \
  https://cda.cfa.harvard.edu/csc21tap/sync

>>> import pyvo as vo
>>> srv = vo.dal.TAPService('https://cda.cfa.harvard.edu/csc21tap')
>>> out = srv.search('SELECT d.detect_stack_id, d.obsid, d.obi FROM csc21.detect_stack d')
>>> len(out)
15533
>>> msg = "# stack obsid obi\n" + \
       "\n".join(sorted(f"{r['detect_stack_id']:24s} {r['obsid']:5d} {r['obi']}" for r in out))
>>>


The pre-CSC 2.2 source display used the following columns

  name, ra, dec,
  err_ellipse_r0, err_ellipse_r1, err_ellipse_ang,
  conf_flag, sat_src_flag,
  acis_num, hrc_num,
  var_flag, significance,
  fluxband, flux, flux_lolim, flux_hilim,
  nh_gal,
  hard_hm, hard_hm_lolim, hard_hm_hilim,
  hard_ms, hard_ms_lolim, hard_ms_hilim

The cone search returns

   name, ra, dec,
   err_ellipse_r0,
   conf_flag, extent_flag, sat_src_flag,
   flux_aper_b, flux_aper_lolim_b, flux_aper_hilim_b,
   flux_aper_w, flux_aper_lolim_w, flux_aper_hilim_w,
   significance,
   hard_hm, hard_hm_lolim, hard_hm_hilim,
   hard_ms, hard_ms_lolim, hard_ms_hilim,
   var_intra_index_b, var_intra_index_w, var_inter_index_b, var_inter_index_w


Aha, the cone search table does have nh_gal.

So we should be able to query the cone search table (or the master-source
one) to get the date we need.

Post arguments:

 "REQUEST=doQuery",
 "PHASE=RUN",
 "FORMAT=text",
 "LANG=ADQL",
 "QUERY=SELECT distinct a.name, a.detect_stack_id from csc21_snapshot.master_stack_assoc a"

The query

QUERY=SELECT
  m.name, m.ra, m.dec,
  m.err_ellipse_r0, m.err_ellipse_r1, m.err_ellipse_ang,
  m.conf_flag, m.sat_src_flag,
  m.acis_num, m.hrc_num,
  m.var_flag, m.significance,
  m.flux, flux_lolim, flux_hilim,
  m.nh_gal,
  m.hard_hm, m.hard_hm_lolim, m.hard_hm_hilim,
  m.hard_ms, m.hard_ms_lolim, m.hard_ms_hilim
  FROM csc21.cone as m
  WHERE dbo.cone_distance(m.ra,m.dec,<ra>,<dec>) <= <r>

ideally

  WHERE
   ( (m.dec BETWEEN x AND x) AND (m.ra BETWEEN x AND x) AND
      dbo.cone_distance(m.ra,m.dec,x,x) <= x )

Or maybe use:

http://cda.cfa.harvard.edu/csccli/getProperties?outputFormat=votable&${queryVersion}&query=select%20distinct%20name,ra,dec,err_ellipse_r0,err_ellipse_r1,err_ellipse_ang,conf_flag,sat_src_flag,acis_num,hrc_num,var_flag,significance,flux_aper_b,flux_aper_lolim_b,flux_aper_hilim_b,flux_aper_w,flux_aper_lolim_w,flux_aper_hilim_w,nh_gal,hard_hm,hard_hm_lolim,hard_hm_hilim,hard_ms,hard_ms_lolim,hard_ms_hilim%20from%20master_source%20where%20dbo.cone_distance%28ra,dec,${ra},${dec}%29%3C%3D${rmax}

http://cda.cfa.harvard.edu/csccli/getProperties?outputFormat=votable&$latest&query=select%20distinct%20name,ra,dec,err_ellipse_r0,err_ellipse_r1,err_ellipse_ang,conf_flag,sat_src_flag,acis_num,hrc_num,var_flag,significance,flux_aper_b,flux_aper_lolim_b,flux_aper_hilim_b,flux_aper_w,flux_aper_lolim_w,flux_aper_hilim_w,nh_gal,hard_hm,hard_hm_lolim,hard_hm_hilim,hard_ms,hard_ms_lolim,hard_ms_hilim%20from%20master_source%20where%20dbo.cone_distance%28ra,dec,194.95291999999992,27.98056%29%3C%3D1

BUT does this work?

Aha, for TAP we need to use udf_spherical_distance(ra1,dec1,ra2,dec2) which
returns a distance in arcminutes.


# Outlines

We should be able to use the CSC 2.1 code.

The stack FOV files are in:

/data/dburke2/L3/rel2.2/outlines/fovs/

% time ./create_stack_outline.py /data/dburke2/L3/rel2.2/outlines/fovs/ stks22.json
Found 11317 stacks
Created: stks22.json

real	7m53.852s
user	5m50.644s
sys	0m21.440s


# OBSID/OBI values

Mike Tibbets has provided a list of OBSID+OBI that are new in CSC 2.2. This is
not needed for wwt22_obis.json

% time ./identify_stacks_obis.py /data/dburke2/L3/rel2.2/outlines/fovs/ wwt22_obis.js
...

real	11m24.440s
user	5m53.934s
sys	0m21.336s


[machine was more loaded than the previous stack outlines and it now also
prints out each stack it's processing to show progress but that makes it
significantly slower too]


# Names

Previously I've tried

    curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select distinct o.obs_id, o.target_name from ivoa.ObsCore o'   http://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis

    curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select o.obsid, o.target_name from cxc.observation o'   http://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis

but both have been problematic (the former seemed to miss observations and
the latter the target names had spaces removed).


% curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select o.obsid, o.target_name from cxc.observation o'   https://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis
% grep -i trapezium cxc_obsid_targetname.lis
3	TRAPEZIUM
4	TRAPEZIUM
18	TRAPEZIUMCLUSTER
26	ORIONTRAPEZIUMSFR
1522	TRAPEZIUMCLUSTER
7407	ORIONTRAPEZIUMCLUSTER
7408	ORIONTRAPEZIUMCLUSTER
7409	ORIONTRAPEZIUMCLUSTER
7410	ORIONTRAPEZIUMCLUSTER
7411	ORIONTRAPEZIUMCLUSTER
7412	ORIONTRAPEZIUMCLUSTER
8568	ORIONTRAPEZIUMCLUSTER
8589	ORIONTRAPEZIUMCLUSTER
8895	ORIONTRAPEZIUMCLUSTER
8896	ORIONTRAPEZIUMCLUSTER
8897	ORIONTRAPEZIUMCLUSTER

So, still all upper case and spaces removed.

% curl --request POST   --location   --data REQUEST=doQuery   --data PHASE=RUN   --data FORMAT=text   --data LANG=ADQL   --data 'QUERY=select distinct o.obs_id, o.target_name from ivoa.ObsCore o'   https://cda.cfa.harvard.edu/cxctap/sync > cxc_obsid_targetname.lis
% grep 8897 cxc_obsid_targetname.lis
8897	Orion Trapezium Cluster
18897	TWA 33

So the names are better. However, 17373 still isn't in the output, but
then again do we use it?

% grep 17373 cxc_obsid_targetname.lis
%

Argh, the ivoa.obscore and cxc.observation tables do not include OBI!

So use Kenny's list: /data/lenin2/ObsPars/obspar.fits

Can we check if a particular OBI is used? I know that obsid=82 has
multiple OBIs and is in the catalog.

% curl --request POST --location --data REQUEST=doQuery --data PHASE=RUN --data FORMAT=text --data LANG=ADQL --data 'QUERY=SELECT d.obsid, d.obi FROM csc21.detect_stack d WHERE d.obsid = 82' https://cda.cfa.harvard.edu/csc21tap/sync
# obsid		Observation identifier
# obi		Observation interval number
obsid	obi
82	1
82	2

Obsids to check:

82, 3057, 943, 4175, 2077, 2783, 2010, 380, 2042, 1578, 906, 800,
3182, 2365, 1561, 861, 897, 279

>>> sorted(xs)
[82, 279, 380, 800, 861, 897, 906, 943, 1561, 1578, 2010, 2042, 2077, 2365, 2783, 3057, 3182, 4175]

% curl --request POST --location --data REQUEST=doQuery --data PHASE=RUN --data FORMAT=text --data LANG=ADQL --data 'QUERY=SELECT d.obsid, d.obi FROM csc21.detect_stack d WHERE d.obsid IN (82, 3057, 943, 4175, 2077, 2783, 2010, 380, 2042, 1578, 906, 800, 3182, 2365, 1561, 861, 897, 279)' https://cda.cfa.harvard.edu/csc21tap/sync
# obsid		Observation identifier
# obi		Observation interval number
obsid	obi
82	1
82	2
279	0
279	1
380	1
380	2
800	0
800	1
861	0
897	1
897	0
906	1
906	2
943	0
943	1
1561	0
1561	1
1578	1
1578	2
2010	1
2042	1
2042	2
2077	1
2077	0
2365	0
2365	2
2783	1
2783	3
3057	1
3057	2
3182	1
3182	2
4175	0
4175	1

So only 861, 2010 only have reported 1 OBI but that may well be because
there is no data in the other OBI. So assume all OBIs are included for
now.

% python find_stack_obi_name_mapping.py \
  /data/dburke2/L3/rel2.2/outlines/fovs/ stack_obsid_obi_name.dat
(433, [3, 4, 1], np.str_('MCG -6-30-15'))
1900 [1, 0] <CAL 83> <>
Found 47651 OBSIDs
82 [2, 1] 1E 0056.8-7154
82 [2, 1] 1E 0056.8-7154
3057 [2, 1] PKS 0156-252
3057 [2, 1] PKS 0156-252
943 [0, 1] MBM 12
943 [0, 1] MBM 12
4175 [0, 1] FORNAX CLUSTER
4175 [0, 1] FORNAX CLUSTER
2077 [1, 0] NGC 1549
2077 [1, 0] NGC 1549
2783 [1, 3] NGC 2060
2783 [1, 3] NGC 2060
2010 [0, 1] PSR0628-28
380 [1, 2] M82
380 [1, 2] M82
2042 [2, 1] ARP 270
2042 [2, 1] ARP 270
1578 [2, 1] NGC4111
1578 [2, 1] NGC4111
906 [1, 2] ABELL 1995
906 [1, 2] ABELL 1995
800 [1, 0] CB 58
800 [1, 0] CB 58
3182 [1, 2] A2065
3182 [1, 2] A2065
2365 [2, 0] 1RXSJ161411.3-630657
2365 [2, 0] 1RXSJ161411.3-630657
1561 [1, 0] SGR A*
1561 [1, 0] SGR A*
861 [0, 1] Q2345+007
897 [1, 0] ABELL 4059
897 [1, 0] ABELL 4059
279 [0, 1] M 31 North
279 [0, 1] M 31 North
Found 11317 stacks, 17879 obsids
Created: stack_obsid_obi_name.dat

% dmlist stack_obsid_obi_name.dat blocks

--------------------------------------------------------------------------------
Dataset: stack_obsid_obi_name.dat
--------------------------------------------------------------------------------

     Block Name                          Type         Dimensions
--------------------------------------------------------------------------------
Block    1: stack_obsid_obi_name.dat       Table         5 cols x 17913    rows
% dmlist stack_obsid_obi_name.dat cols

--------------------------------------------------------------------------------
Columns for Table Block stack_obsid_obi_name.dat
--------------------------------------------------------------------------------

ColNo  Name                 Unit        Type             Range
   1   stack                             String[24]
   2   obsid                             Real8          -Inf:+Inf
   3   obi                               Real8          -Inf:+Inf
   4   combined                          String[9]
   5   name                              String[38]


Rather than the identify* code, we can create a bunch of the files in
one go.

We use the csc2.2-new-obsids-from-database.txt file to identify
whether a stack is

  new in CSC 2.2
  changed in CSC 2.2
  unchanged in CSC 2.2

% python ./make_wwt22_json.py stack_obsid_obi_name.dat
Created: wwt22_obis.js
Created: wwt22_names.js
Created: wwt22_stacks.json

New is the wwt22_counts.js file, as this used to be provided by
the wwt<n>_status.json file.

% time python make_wwt22_counts.py
Processing 11317 stacks
Created: wwt22_counts.js

real	61m33.410s
user	2m26.225s
sys	0m14.189s

Now have the counts can re-create the stacks file.

% time python ./make_wwt22_json.py stack_obsid_obi_name.dat
Created: wwt22_obis.js
Created: wwt22_names.js
Created: wwt22_stacks.json

real	0m0.410s
user	0m0.557s
sys	0m0.068s


Note: are all these still needed as the stacks contains both obis and names
data?

The obi_map and stack_name_map variables dot appear to be used anymore.


# Stack count

Ian has noted that CSC 2.2 has 17879 individual observations. However,
I get a different number:

% dmlist stack_obsid_obi_name.dat"[cols obsid]" data,clean | tail -n +2 | sort | uniq | wc -l
17863
% dmlist stack_obsid_obi_name.dat"[cols combined]" data,clean | tail -n +2 | sort | uniq | wc -l
17881
% dmlist stack_obsid_obi_name.dat"[cols combined]" data,clean | tail -n +2 | sort |  wc -l
17913

Dave Plummer responded with:

Here is the proper mapping of 17879 OBIs to 11317 stacks in CSC2.2, see:
/data/L3/tap/xfer/stk_obi_csc22.txt

Here's how you can adjust your list to align with the proper CSC2.2 mapping:

1. Not all OBIs for a given Obsid are included in the catalog (e.g. we don't have 1999 data yet)
    Exclude these OBIs from your list :  00861_001  &  02010_000
    But keep  00861_000  &  02010_001

2. Each OBI is assigned to just 1 stack (and OBIs from the same Obsid can go to different stacks).
    Remove the duplicated OBIs (use the assignments from stk_obi_csc22.txt)
    For example:

    $ grep  02077_  /data/L3/tap/xfer/stk_obi_csc22.txt
    acisfJ0415461m553331_001 02077_001
    acisfJ0415585m553456_001 02077_000

    $ grep  02077_  stack_obsid_obi_name.dat
    acisfJ0415461m553331_001  2077   1 02077_001 "NGC 1549"
    acisfJ0415461m553331_001  2077   0 02077_000 "NGC 1549"
    acisfJ0415585m553456_001  2077   1 02077_001 "NGC 1549"
    acisfJ0415585m553456_001  2077   0 02077_000 "NGC 1549"



% cp /data/L3/tap/xfer/stk_obi_csc22.txt .
% head -4 stk_obi_csc22.txt
acisfJ0000082p135624_001 11490_000
acisfJ0000115p321112_001 20515_000
acisfJ0000172m602226_001 19758_000
acisfJ0000286p171254_001 26156_000

>>> from pycrates import read_file
>>> me = read_file("stack_obsid_obi_name.dat")
>>> csc = read_file("stk_obi_csc22.txt")
>>> expected = {}
>>> for s,o in zip(csc.get_column(0).values, csc.get_column(1).values):
...     try:
...         expected[s].add(str(o))
...     except KeyError:
...         expected[s] = set([str(o)])
...
>>> len(expected)
11317
>>> expected["acisfJ0000286p171254_001"]
{'26156_000'}
>>> max([len(o) for o in expected.values()])
100

>>> got = {}
>>> for s,o in zip(me.get_column("stack").values, me.get_column("combined").values):
...     try:
...         got[s].add(str(o))
...     except KeyError:
...         got[s] = set([str(o)])
...
>>> len(got)
11317
>>> got["acisfJ0000286p171254_001"]
{'26156_000'}
>>> max([len(o) for o in got.values()])
100

The stacklist is the same:

>>> sexp = set(expected.keys())
>>> sgot = set(got.keys())
>>> sexp == sgot
True

The different stacks are:

>>> diffstacks = []
>>> for stack in sexp:
...     if expected[stack] == got[stack]:
...         continue
...     diffstacks.append(str(stack))
...
>>> len(diffstacks)
14
>>> diffstacks
['acisfJ0415585m553456_001', 'acisfJ1049595p330047_001', 'acisfJ1452527p580044_001', 'acisfJ1522333p274235_001', 'acisfJ1452403p580256_001', 'acisfJ1049461p325717_001', 'acisfJ2357001m344645_001', 'acisfJ2348180p005833_001', 'acisfJ0630490m283517_001', 'acisfJ0955082p693910_001', 'acisfJ1522278p274133_001', 'acisfJ0415461m553331_001', 'acisfJ0955263p693735_001', 'acisfJ2357060m344542_001']


>>> for stack in sorted(diffstacks):
...     print(stack, len(expected[stack]), len(got[stack]))
...
acisfJ0415461m553331_001 1 2
acisfJ0415585m553456_001 1 2
acisfJ0630490m283517_001 1 2
acisfJ0955082p693910_001 1 2
acisfJ0955263p693735_001 3 4
acisfJ1049461p325717_001 1 2
acisfJ1049595p330047_001 1 2
acisfJ1452403p580256_001 1 2
acisfJ1452527p580044_001 1 2
acisfJ1522278p274133_001 1 2
acisfJ1522333p274235_001 1 2
acisfJ2348180p005833_001 1 2
acisfJ2357001m344645_001 2 3
acisfJ2357060m344542_001 1 2

So, I have more stacks than the catalog - this is presumable because
of the OBIs.

But then why do I have less obsids?

>>> cts = [len(v) for v in expected.values()]
>>> cts[0:6]
[1, 1, 1, 1, 1, 1]
>>> sum(cts)
17879

This is the value that Ian reported.

>>> cts2 = [len(v) for v in got.values()]
>>> sum(cts2)
17893

Note that this does not match the "combined" count above of 17881 that
I get from the table. So, as Dave pointed out, there are some duplicates.
It looks like an "observation" is a obsid + obi.

So this means I need to look at

  % python find_stack_obi_name_mapping.py \
    /data/dburke2/L3/rel2.2/outlines/fovs/ stack_obsid_obi_name.dat

This is a lot easier.

% cp find_stack_obi_name_mapping.py find_stack_obi_name_mapping_orig.py
% cp stack_obsid_obi_name.dat stack_obsid_obi_name_orig.dat

No need to time this as it does not need to hunt through all the
FOV files:

% python find_stack_obi_name_mapping.py stack_obsid_obi_name.dat
(433, [3, 4, 1], np.str_('MCG -6-30-15'))
1900 [1, 0] <CAL 83> <>
Found 47684 OBSIDs
Found 11317 stacks, 17879 observations
Created: stack_obsid_obi_name.dat

% diff stack_obsid_obi_name.dat stack_obsid_obi_name_orig.dat
718a719
> acisfJ0058300m713533_001    82   2 00082_002 "1E 0056.8-7154"
720a722
> acisfJ0058300m713533_001    82   1 00082_001 "1E 0056.8-7154"
1559a1562
> acisfJ0158351m245956_001  3057   2 03057_002 "PKS 0156-252"
1561a1565
> acisfJ0158351m245956_001  3057   1 03057_001 "PKS 0156-252"
2055a2060,2061
> acisfJ0255501p193011_001   943   0 00943_000 "MBM 12"
> acisfJ0255501p193011_001   943   1 00943_001 "MBM 12"
2648a2655,2656
> acisfJ0339293m354513_001  4175   0 04175_000 "FORNAX CLUSTER"
> acisfJ0339293m354513_001  4175   1 04175_001 "FORNAX CLUSTER"
2934a2943
> acisfJ0415461m553331_001  2077   0 02077_000 "NGC 1549"
2935a2945
> acisfJ0415585m553456_001  2077   1 02077_001 "NGC 1549"
3754a3765,3766
> acisfJ0537493m690952_001  2783   1 02783_001 "NGC 2060"
> acisfJ0537493m690952_001  2783   3 02783_003 "NGC 2060"
4096a4109
> acisfJ0630490m283517_001  2010   0 02010_000 "PSR0628-28"
5578a5592
> acisfJ0955082p693910_001   380   2 00380_002 "M82"
5588a5603
> acisfJ0955263p693735_001   380   1 00380_001 "M82"
6421a6437
> acisfJ1049461p325717_001  2042   2 02042_002 "ARP 270"
6424a6441
> acisfJ1049595p330047_001  2042   1 02042_001 "ARP 270"
7471a7489
> acisfJ1207004p430341_001  1578   2 01578_002 "NGC4111"
7473a7492
> acisfJ1207004p430341_001  1578   1 01578_001 "NGC4111"
10626a10646
> acisfJ1452403p580256_001   906   2 00906_002 "ABELL 1995"
10628a10649
> acisfJ1452527p580044_001   906   1 00906_001 "ABELL 1995"
10880a10902
> acisfJ1514191p363602_001   800   1 00800_001 "CB 58"
10882a10905
> acisfJ1514191p363602_001   800   0 00800_000 "CB 58"
10956a10980,10981
> acisfJ1522278p274133_001  3182   2 03182_002 "A2065"
> acisfJ1522333p274235_001  3182   1 03182_001 "A2065"
11506a11532
> acisfJ1614096m630651_001  2365   2 02365_002 "1RXSJ161411.3-630657"
11508a11535
> acisfJ1614096m630651_001  2365   0 02365_000 "1RXSJ161411.3-630657"
13090a13118
> acisfJ1745401m290028_002  1561   1 01561_001 "SGR A*"
13092a13121
> acisfJ1745401m290028_002  1561   0 01561_000 "SGR A*"
16568a16598
> acisfJ2348180p005833_001   861   1 00861_001 "Q2345+007"
16614a16645
> acisfJ2357001m344645_001   897   0 00897_000 "ABELL 4059"
16615a16647
> acisfJ2357060m344542_001   897   1 00897_001 "ABELL 4059"
16749a16782,16783
> hrcfJ0044069p414315_001    279   0 00279_000 "M 31 North"
> hrcfJ0044069p414315_001    279   1 00279_001 "M 31 North"

So, why did I have this replication?

% grep " 279 " stack_obsid_obi_name_orig.dat
hrcfJ0044069p414315_001    279   0 00279_000 "M 31 North"
hrcfJ0044069p414315_001    279   1 00279_001 "M 31 North"
hrcfJ0044069p414315_001    279   0 00279_000 "M 31 North"
hrcfJ0044069p414315_001    279   1 00279_001 "M 31 North"

Let's not worry about that:

% grep " 279 " stack_obsid_obi_name.dat
hrcfJ0044069p414315_001    279   0 00279_000 "M 31 North"
hrcfJ0044069p414315_001    279   1 00279_001 "M 31 North"

% dmlist stack_obsid_obi_name.dat blocks

--------------------------------------------------------------------------------
Dataset: stack_obsid_obi_name.dat
--------------------------------------------------------------------------------

     Block Name                          Type         Dimensions
--------------------------------------------------------------------------------
Block    1: stack_obsid_obi_name.dat       Table         5 cols x 17879    rows

Recreate the files:

% python ./make_wwt22_json.py stack_obsid_obi_name.dat
Created: wwt22_obis.js
Created: wwt22_names.js
Created: wwt22_stacks.json

## Ensemble information

% python ens2json.py ens_stk_csc22.txt > ens22.json


## Version information

We use version22.name.jsno files to identify the version numbers for
data products. It is all a bit messy. The code has been cleaned up
to address some issues (it processes each option separately now, which
means that there is no worry about a partially-complete stack being
processed)

% python ./get_stack_names_all.py stk_obi_csc22.txt
# stkevt3
Created: version22.stkevt3

# stkecorrimg
Created: version22.stkecorrimg

# stkbkgimg
Created: version22.stkbkgimg

# stkexpmap
Created: version22.stkexpmap

# sensity
Created: version22.sensity

% python get_stack_versions_as_json.py stkevt3
Reading from: version22.stkevt3
Version breakdown
  version=  20  count= 3876
  version=  26  count= 3369
  version=  27  count= 1362
  version=  25  count= 604
  version=  29  count= 497
  version=  28  count= 484
  version=  30  count= 390
  version=  81  count= 366
  version=  33  count= 84
  version=  31  count= 72
  version=  21  count= 65
  version=  22  count= 46
  version=  32  count= 37
  version=  34  count= 18
  version=  35  count= 14
  version=  82  count= 9
  version=  84  count= 6
  version=  41  count= 5
  version=  36  count= 5
  version=  38  count= 2
  version=  37  count= 2
  version=  23  count= 1
  version=  39  count= 1
  version=  40  count= 1
  version=  83  count= 1
Created: version22.stkevt3.json


% foreach o ( stkevt3 stkecorrimg stkbkgimg stkexpmap sensity )
foreach? python get_stack_versions_as_json.py $o
foreach? end


# Ensemble outlines

# Outlines

The ensemle FOV files are in:

  /data/dburke2/L3/rel2.2/outlines/ensembles.2026-08-21/

% time ./create_ensemble_outline.py /data/dburke2/L3/rel2.2/outlines/ensembles.2026-08-21/ ens22.outlines.json
Found 6673 ensembles
Created: ens22.outlines.json
42.246u 5.293s 1:34.14 50.4%	0+0k 32+11512io 0pf+0w


Re-create the stack outlines to try and get the ordering correct
(so that they could be filled in WWT if we want and work out how
to handle holes):

% time ./create_stack_outline.py /data/dburke2/L3/rel2.2/outlines/fovs/ stks22.json
Found 11317 stacks
Created: stks22.json
... 31:36.00 47.9% ...

Don't know why significantly slower.

% cp stks22.json /data/da/Docs/cscweb/csc2.2/wwtdata/wwt22_outlines.json


Reworking how ensembles are labelled to use the same system for
the different ensemble mappings.

% time ./create_ensemble_outline.py /data/dburke2/L3/rel2.2/outlines/ensembles.2026-08-21/ ens22.outlines.json
