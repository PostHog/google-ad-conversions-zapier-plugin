# Google Ad Conversions Plugin (with Zapier)

Sends Google Ads conversion events to a Zapier webhook.

Given a set of conversion definitions, call a Zapier webhook whenever an event comes in that looks like a conversion. In production, this webhook is configured to add a row to a Google Sheet which is then ingested by Google Ads.

This plugin is still in active development within PostHog and should not be considered a stable release.

## Configuration

See [plugin.json](/plugin.json) and [conversion_definitions.example.json](/conversion_definitions.example.json).

## Action matching

This plugin operates on an event stream, with some rudimentary abilities to define conversion event criteria. When `onAction` is implemented in the plugin server, it will likely replace the current method of configuration.
