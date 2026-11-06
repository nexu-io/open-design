# Studio open work-count fixture

A 60 s film of twelve 5 s scenes, each its own composition file, with no media. It has the
shape of a real multi-scene film (a timeline clip thumbnail and a composition card per scene,
one preview document) at a size that belongs in the repository. `studio-open-counts.mjs` opens
it and counts the work Studio does until the film can play and in the 20 s after.

The repository's `.gitignore` excludes `compositions/`, so the scene files are committed with
`git add -f`. The journey refuses to measure when a scene `index.html` mounts is missing.
