## touch /home/dburke/start-crontab-hack
# export PATH=/data/dburke2/local/Linux/anaconda/bin:$PATH
export PATH=/lagado2.real/local/anaconda/bin:$PATH
source activate csc2
# conda activate csc2

outdir=/data/da/Docs/cscweb/csc2
outjsondir=${outdir}/wwtdata

cd /data/dburke2/L3/rel2.0/status

# no longer need to look at processing status
# python make_page.py linear

echo "# Starting csccli call: `date`"
time curl -o source_properties.tsv --silent \
   --form version=cur --form outputFormat=tsv --form coordFormat=decimal \
   --form query='SELECT DISTINCT m.name,m.ra,m.dec,m.err_ellipse_r0,m.err_ellipse_r1,m.err_ellipse_ang,m.conf_flag,m.sat_src_flag,m.acis_num,m.hrc_num,m.var_flag,m.significance,m.flux_aper_b,m.flux_aper_lolim_b,m.flux_aper_hilim_b,m.flux_aper_w,m.flux_aper_lolim_w,m.flux_aper_hilim_w,m.nh_gal,m.hard_hm,m.hard_hm_lolim,m.hard_hm_hilim,m.hard_ms,m.hard_ms_lolim,m.hard_ms_hilim FROM master_source m ORDER BY name ASC' \
   http://cda.cfa.harvard.edu/csccli/getProperties
echo "# Ended csccli call: `date`"

echo "# Starting props2json: `date`"
python props2json.py prerelease_filtered.fits source_properties.tsv wwt_srcprop
echo "# Ended props2json: `date`"

# require -n in gzip to ensure the output is deterministic (i.e. same contents
# evaluate to same output file); -n strips name and time stamp, the latter
# being the culprit
#
rm wwt_srcprop.*.json.gz
gzip -n wwt_srcprop.*.json

# Since we are near the end of the process, and the times are all messed
# up, do not copy over the "status" information anymore.
#
# cp processing_status.xml coverage_pcen.png timeplot.png ${outdir}/

# no longer need to copy this over
# cp processing_status.xml ${outdir}/

# cp stacks.txt ${outdir}/   # as now all True, no need to copy
cp wwt_status.json ${outjsondir}/

# hope that the JSON output is deterministic so this check is worth it
#
for x in wwt_srcprop.*.json.gz ; do
  diff -q $x ${outjsondir}/$x
  if [ $? -ne 0 ] ; then
    cp $x ${outjsondir}/
  fi
done

cd ${outjsondir}/

# publish=/data/da/Docs/web4/ciao410/publish.pl
publish=/data/da/Docs/web4/ciao411/publish.pl

# With lagado replacement, something has changed which means that
# (I *think&) /bin/perl rather than /usr/local/bin/perl is being
# used, which doesn't have the LibXML/XSLT modules, and so everything
# fails. See if we can fix this.
#
# perl=perl
perl=/usr/local/bin/perl

$perl $publish wwt_status.json wwt_srcprop.*.json.gz
$perl $publish wwt_status.json wwt_srcprop.*.json.gz --type=live

cd ..

# $perl $publish processing_status.xml coverage_pcen.png timeplot.png

# $perl $publish processing_status.xml stacks.txt

# no longer need to do this
# $perl $publish processing_status.xml

# $perl $publish processing_status.xml coverage_pcen.png timeplot.png --type=live

# $perl $publish processing_status.xml stacks.txt  --type=live

# no lnger need to do this
# $perl $publish processing_status.xml  --type=live

# touch /home/dburke/stop-crontab-hack
