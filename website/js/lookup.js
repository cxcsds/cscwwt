'use strict';

/* global XMLHttpRequest */

// This used to use the lookUP service for converting Astronomical names to
// RA/Dec values -  https://www.strudel.org.uk/lookUP/ - but this service
// was shut down due to inconsiderate users.
//
// I am currently using a basic nameserver I've cobbled together. It is not
// as useful as the lookUP service.
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

    var src = 'https://namesky.herokuapp.com/name/' +
      cleanQueryValue(objectName);

    // Why am I not using d here?
    lup.onreadystatechange = (d) => {
      if (lup.readyState === XMLHttpRequest.DONE) {
        if (lup.status === 200) {
          try {
            const response = JSON.parse(lup.responseText);
            process(objectName, callback, errhandle, response);
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

  function process(objectname, callback, errhandle, d) {

    if (typeof d === 'undefined' || typeof d.status === 'undefined') {
      errhandle('There was a problem querying the name server.');
      return;
    }

    if (!d.status) {
      errhandle(`Target "${objectname}" not found.`);
      return;
    }

    if (typeof d.location !== 'object') {
      // Would it make sense to dump d to the console here?
      errhandle('The name server is apparently rather confused.');
      return;
    }

    const loc = d.location;
    if (typeof loc.ra === 'undefined' || typeof loc.dec === 'undefined') {
      // Would it make sense to dump d to the console here?
      errhandle('The name server is apparently rather confused.');
      return;
    }

    callback(loc.ra, loc.dec);
  }

  return { lookupName: lookupName };

})();
