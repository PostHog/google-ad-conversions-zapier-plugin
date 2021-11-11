# Google Ad Conversions Plugin (with Zapier)

Sends Google Ads conversion events to a Zapier webhook.

Given a set of action ids and conversion names, this plugin finds events which fall under the action's definition, and sends them to a Zapier webhook. In production, this webhook is configured to add a row to a Google Sheet which is then ingested by Google Ads.

## Configuration

See [plugin.json](/plugin.json).

A note on `action_map`:

For example input `11036:Sign up - cloud,11037:Sign up - self-hosted free,11038:Sign up - self-hosted paid`, the plugin will behave such that:

1. Event(s) come in that match the definition of actions `11036`, `11037`, or `11038`.
2. We check every event for the property `gclid`. This should be set if at any point in the session, the user had `gclid` in their browser's querystring.
3. Send the `gclid`, event timestamp, and conversion name (`Sign up - cloud`) to the Zapier webhook. An array will be sent, one for each matched event.
4. Zapier processes the incoming array and adds each event as a new row to the Google sheet.

## Action matching

**Warning:** This is an experimental feature.

This plugin includes generic action matching logic which tries to be as close as possible to action matching in the production Python environment. This is so that conversion definitions can be defined at whim by Marketing, by creating actions in PostHog. However, there are certain known differences in action matching behavior (and perhaps others not listed here), as a result of the limitations of the NodeJS environment, plugin VM packages, and so on.

Known failure cases for action matching:

- Matching by person properties. Only event properties are supported; trying to match via person properties will throw an error.
- Any Postgres-specific regex syntax. This plugin uses standard JavaScript regex and will log a warning when events are matched to actions using regex operators.
- Matching of `$autocapture` events via DOM selectors is not supported. This plugin will log a warning and not match an event when trying to use DOM selectors.
- `%` wildcard in values matched using `contains`, `icontains`, or `not_icontains` operators. These operators use simple substring search in the plugin environment and do not support wildcards.
