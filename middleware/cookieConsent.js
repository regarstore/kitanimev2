const { getSetting } = require('../models/database');

async function cookieConsent(req, res, next) {
  try {

    const consentEnabled = await getSetting('cookie_consent_enabled');

    if (consentEnabled === '1') {

      const hasConsent = req.cookies.cookie_consent;

      res.locals.showCookieConsent = !hasConsent;
      res.locals.cookieConsentGiven = !!hasConsent;
    } else {
      res.locals.showCookieConsent = false;
      res.locals.cookieConsentGiven = true;
    }

    next();
  } catch (error) {
    console.error('Cookie consent middleware error:', error);
    res.locals.showCookieConsent = false;
    res.locals.cookieConsentGiven = true;
    next();
  }
}

module.exports = cookieConsent;
