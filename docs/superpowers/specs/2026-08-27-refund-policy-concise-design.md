# Refund Policy Concise Redesign

## Goal

Rewrite the refund-policy page as a short, scannable legal policy modeled on the supplied reference: numbered headings, short bullet points, bold key conditions, light dividers, and no repetitive explanation.

## Content structure

1. **Subscription orders** — full refund within 7 calendar days only when the paid benefits from that order remain unused.
2. **Not eligible** — used benefits, requests after 7 days, abuse or violations, cashing out promotional value, and third-party marketplace purchases.
3. **How to apply** — email `support@open-design.ai` from the account email and include the order/payment number and reason.
4. **Processing time** — OpenDesign verifies backend usage records; approved refunds are initiated to the original payment method within 10 business days.
5. **Special cases** — duplicate/incorrect charges and system-caused usage receive manual review; mandatory legal rights remain unaffected.

The English and Simplified Chinese versions carry the same meaning. Extra top-up purchases are not assigned a new refund rule in this edit because that policy has not yet been explicitly approved.

## Visual treatment

- Keep the existing site header and footer.
- Replace the large summary card, application card, timeline, and FAQ accordion with a plain document column.
- Use numbered section headings, compact bullets, bold lead phrases, and horizontal separators.
- Keep one understated email link at the bottom.
- Maintain mobile readability and accessible semantic headings/lists.

## Verification

- Contract tests assert the 7-day zero-use rule, 10-business-day timing, support email, legal override, and concise section model.
- Typecheck and full static build must pass.
- Refresh the existing local preview and visually verify the Chinese page on desktop.
