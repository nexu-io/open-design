# Remotion Composition Checklist

Use this checklist to ensure your Remotion walkthrough video composition is complete and follows best practices.

## ✅ Project Setup

- [ ] Remotion project initialized (or existing project verified)
- [ ] Dependencies installed (`@remotion/transitions`, etc.)
- [ ] Asset directory created (`public/assets/screens/`)
- [ ] Screen manifest created (`screens.json`)

## ✅ Asset Preparation

- [ ] All Stitch screenshots downloaded
- [ ] Images saved with descriptive names
- [ ] Image dimensions recorded in manifest
- [ ] Images optimized for size (if needed)
- [ ] Asset paths are correct and relative to `public/`

## ✅ Component Structure

- [ ] `ScreenSlide.tsx` component created
  - [ ] Props interface defined
  - [ ] Zoom animation implemented
  - [ ] Fade animation implemented
  - [ ] Text overlay included
- [ ] `WalkthroughComposition.tsx` created
  - [ ] Screen manifest imported
  - [ ] `<Sequence>` components for each screen
  - [ ] Transitions between screens configured
  - [ ] Proper timing offsets calculated

## ✅ Configuration

- [ ] `remotion.config.ts` updated
  - [ ] Composition ID set
  - [ ] Video dimensions configured
  - [ ] Frame rate set (30 or 60 fps)
  - [ ] Duration calculated correctly
- [ ] Video metadata set (if applicable)
  - [ ] Title
  - [ ] Description

## ✅ Animations & Transitions

- [ ] Spring animations use appropriate configs
  - [ ] Damping values (8-15 typical)
  - [ ] Stiffness values (60-100 typical)
- [ ] Transitions feel smooth
- [ ] Text overlays timed correctly
- [ ] No jarring or abrupt changes

## ✅ Visual Quality

- [ ] Text is readable at all times
- [ ] Sufficient contrast between text and background
- [ ] Font sizes appropriate for video resolution
- [ ] Images display without distortion
- [ ] Aspect ratios maintained

## ✅ Timing

- [ ] Each screen displays for appropriate duration
- [ ] Total video length is reasonable (not too long/short)
- [ ] Transitions don't feel rushed
- [ ] Text has time to be read

## ✅ Preview & Testing

- [ ] Preview in Remotion Studio (`npm run dev`)
- [ ] Scrub through timeline to check all frames
- [ ] Verify smooth playback
- [ ] Check for any rendering errors
- [ ] Test on different screen sizes (if responsive)

## ✅ Rendering

- [ ] Render command tested and works
- [ ] Output format chosen (MP4, WebM, etc.)
- [ ] Quality settings configured
- [ ] Codec specified (h264 recommended)
- [ ] Final video renders without errors

## ✅ Final Output

- [ ] Video file generated successfully
- [ ] File size is reasonable
- [ ] Video plays correctly in media players
- [ ] Audio included (if applicable)
- [ ] Metadata embedded (if needed)

## 🎨 Optional Enhancements

- [ ] Progress indicator showing current screen
- [ ] Custom logo or branding
- [ ] Background music or sound effects
- [ ] Voiceover narration
- [ ] Interactive hotspots highlighting features
- [ ] Call-to-action at end

## 📋 Best Practices Verified

- [ ] Component code is modular and reusable
- [ ] TypeScript interfaces used for props
- [ ] No hardcoded values (use manifest/config)
- [ ] Code follows Remotion conventions
- [ ] Comments added for complex logic
- [ ] Assets organized in clear folder structure

## 🐛 Common Issues Checked

- [ ] No blurry images (check source resolution)
- [ ] No misaligned text (verify positioning)
- [ ] No choppy animations (check spring configs)
- [ ] No missing assets (verify all paths)
- [ ] No build errors (run `npm run build` test)

---

**Notes:**
- Mark items with `[x]` as you complete them
- Add custom checklist items specific to your project
- Review Remotion documentation for updates
- Test final video on target platform (YouTube, social, etc.)
