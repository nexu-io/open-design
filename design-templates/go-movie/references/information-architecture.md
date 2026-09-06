# Information architecture — film festival / cinephile hub

## The model

A GO MOVIE–style product is a **four-level tree** that fans out from a
single festival scope down to an individual item:

```
Festival / Scope
    ↓
Topic                      (a curated slice: a programme, a strand, a month)
    ↓
Content type               (film · cinema · merch · guide · community note)
    ↓
Individual item            (one film, one venue, one tote, one tip)
```

- **Festival / Scope** is the root — usually one film festival, film week,
  or a standing cinephile community. It sets the hero, the dates, the
  venues, and the tone.
- **Topic** is a filterable slice *within* the festival: a national
  programme ("French Panorama"), a strand ("Restored Classics"), a time
  window ("This Month"), or a venue. Topics are not separate products; they
  are lenses over the same pool of items.
- **Content type** is the shape of the item: Film, Cinema, Merch, Guide, or
  a community note. Each type has its own card (see `components.md`).
- **Individual item** is the atomic unit the user reads, saves, or acts on.

## The five content types

| Type | Answers the question | Typical fields |
|---|---|---|
| **Film** | *What should I watch?* | poster, title, country · year · duration, recommendation reason, tags, session status, venue + time |
| **Cinema** | *How does this venue actually work?* | name, address, halls, transport, entry/ticket/seat tips, cinephile experience |
| **Merch** | *Where do I get the limited stuff?* | image, name, author/source, pickup point, quantity, condition, related film/festival, availability |
| **Guide** | *How do I survive between screenings?* | rush-between-venues, transport, food, rest, queues, avoid, viewing etiquette |
| **Community note** | *What are people saying?* | a recommendation, a warning, an event update — attributed and datestamped |

## Relationships between types

This is the crux. **An item can belong to several dimensions at once**, and
the interface should expose those links rather than hide them:

```
a limited tote
  → belongs to a festival   (Harbor International Film Week)
  → belongs to a venue      (pickup: The Old Dock, lobby desk)
  → relates to a film       (The Salt Line)
  → is a merch item         (quantity, condition, availability)
```

Concretely:

- A **Merch** item points back to its **Film** and forward to its pickup
  **Cinema**.
- A **Cinema** card lists the **Films** screening there this week and any
  **Guides** that mention it (queues, bag check).
- A **Film** card links its screening **Cinema** + time and any tied **Merch**.
- A **Guide** can reference several **Cinemas** ("Old Dock → North Pier is a
  22-minute walk") and several **Films** ("don't book screenings closer than
  40 minutes apart").

Because a single item sits at the intersection of dimensions, the home page
cannot be a flat, type-segmented list. It needs:

1. a **hero** that anchors the festival scope;
2. **topic pills** that re-slice the same pool;
3. a **mixed "today's hot" feed** that prioritizes usefulness, not type;
4. typed **sections** for deep browsing (films, merch, cinemas, guides).

## Why this differs from a movie database app

A database app (IMDb-style) is organized around one entity — the film — and
every other fact hangs off it. A cinephile festival hub is organized around a
**temporary, real-world event**: the festival. Films, venues, merch, and tips
are all equally first-class because the user's real question is "how do I get
through this specific ten days?", not "what is this film's rating?". The
multi-dimensional cross-linking is the product, not an afterthought.

## Ordering principle

Within any list, put the **most decision-relevant item first**. For a festival
that means: what's selling out, what's a bad queue, what's free and where —
before the merely interesting. "Most useful first" is a hard rule, not a
sorting nicety.
