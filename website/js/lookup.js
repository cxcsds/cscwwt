'use strict';

/* global XMLHttpRequest */

// This used to use the lookUP service for converting Astronomical names to
// RA/Dec values -  https://www.strudel.org.uk/lookUP/ - but this service
// was shut down due to inconsiderate users.
//
// I was using a basic nameserver I cobbled together. It is not
// as useful as the lookUP service: https://namesky.herokuapp.com/name/<name>
// but it looks like we can query the CDS service directly (but then
// we need to deal with the response not being easily parseable).
//
// Details at: http://vizier.u-strasbg.fr/vizier/doc/sesame.htx
//
const lookup = (() => {

  function cleanQueryValue(val) {
    return encodeURIComponent(val)
      .replace(/!/g, '%21')
      .replace(/'/g, '%27')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29')
      .replace(/\*/g, '%2A')
      .replace(/%0A/g, '\n');
  }

  // Try to support different endpoints, but this is currently
  // not tied to UI (i.e. there's no way for a user to change it).
  //
  const base_urls = {
    cds: {url: 'https://cdsweb.u-strasbg.fr/cgi-bin/nph-sesame',
	  label: 'CDS'},
    cfa: {url: 'https://vizier.cfa.harvard.edu/viz-bin/Sesame',
	  label: 'CfA'},
    za: {url: 'https://vizier.idia.ac.za/viz-bin/nph-sesame',
	 label: 'South Africa' },
  };

  // What URL should we use: the argument must be a key for
  // base_urls.
  //
  var base_url_name = 'cfa';
  function set_base_url(label) {
    if (!base_urls.hasOwnProperty(label)) {
      return false;
    }
    base_url_name = label;
    return true;
  }

  // This could return the actual URL but leave as is for symmetry and
  // because there may be a use for access to this data.
  //
  function get_base_url() {
    return base_url_name;
  }

  function get_label() {
    return base_urls[base_url_name].label;
  }

  // Look up the name and if there is a success call
  //      callback(ra, dec)
  // and error handler (string argument, representing HTML for the
  // message).
  //
  function lookupName(objectName, callback, errhandle) {

    const lup = new XMLHttpRequest();
    if (!lup) {
      errhandle('INTERNAL ERROR: unable to create request');
      return;
    }

    // This should use the caching that Sesame supports
    const base_url = base_urls[base_url_name].url;
    var src = base_url + '/-ox/SNV?' + cleanQueryValue(objectName);
    wwt.trace(`Search URL: [${src}]`)

    // Why am I not using d here?
    lup.onreadystatechange = (d) => {
      if (lup.readyState === XMLHttpRequest.DONE) {
        if (lup.status === 200) {
          try {
            process(objectName, callback, errhandle, lup.responseXML);
          } catch (e) {
            errhandle('Unable to decode the response from the name server.');
          }
        } else {
	  errhandle('There was a problem calling the name server.');
        }
      }
    };

    lup.open('GET', src);
    lup.send();
  }

  // Could target the Resolver element and then the ra/dec using that, but
  // for now just grab them both separately.
  //
  const raPath = "/Sesame/Target/Resolver/jradeg";
  const decPath = "/Sesame/Target/Resolver/jdedeg";

  function process(objectname, callback, errhandle, d) {

    if (typeof d === 'undefined') {
      errhandle('There was a problem querying the name server.');
      return;
    }

    // See https://developer.mozilla.org/en-US/docs/Web/XPath/Introduction_to_using_XPath_in_JavaScript
    //
    var ra = d.evaluate(raPath, d, null, XPathResult.NUMBER_TYPE, null).numberValue;
    var dec = d.evaluate(decPath, d, null, XPathResult.NUMBER_TYPE, null).numberValue;

    if (Number.isNaN(ra) || Number.isNaN(dec)) {
      errhandle(`Target "${objectname}" not found.`);
      return;
    }

    callback(ra, dec);
  }

  return { lookupName: lookupName,
	   get_base_url: get_base_url,
	   set_base_url: set_base_url,
	   get_label: get_label
	 };

})();
