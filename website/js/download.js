'use strict';

/* global XMLHttpRequest */
/* global wwt */

/*
 * Hopefully simple wrapper around XMLHttpRequest
 *
 * getJSON is sent the URL, the callback on success, which is sent the
 * payload of the URL, and a callback on failure which is sent a
 * boolean indicating whether the call ended but returned a non-200
 * status (true), of if it errorored out during the call (false). The
 * routine returns false if a request could not be created, otherwise
 * true. The spinner is run during the call.
 */

const download = (() => {

  function getJSON(url, success, failure) {
    const req = new XMLHttpRequest();
    if (!req) {
      wwt.trace(`Unable to create request for ${url}`);
      return false;
    }

    wwt.startSpinner();
    req.addEventListener('load', () => {
      wwt.stopSpinner();
      if (req.status === 200) {
        wwt.trace(`-- downloaded: ${url}`);
	success(req.response);
      } else {
        wwt.trace(`-- unable to download: ${url} status=${req.status}`);
        failure(true);
      }
    }, false);

    req.addEventListener('error', () => {
      wwt.stopSpinner();
      wwt.trace(`-- error downloading: ${url}`);
      failure(false);
    }, false);

    req.open('GET', url);
    req.responseType = 'json';
    req.send();
    wwt.trace(` -- requesting JSON from ${url}`);
    return true;

  }

  return { getJSON: getJSON };

})();
