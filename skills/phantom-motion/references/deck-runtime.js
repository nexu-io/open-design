/**
 * Phantom Deck Runtime Engine v9.1 (Pro-Grade)
 * Featuring: GSAP Flip (Magic Move), 3D Overview Mode, Pro Keyboard Navigation, and State Isolation.
 */

// Register GSAP Plugins (Requires GSAP Flip to be loaded in HTML)
if (window.gsap && window.Flip) {
    gsap.registerPlugin(Flip);
}

window.PhantomDeck = (function() {
    let currentSlide = 0;
    let slides = [];
    let isAutoPlay = false;
    let ttsAudio = null;
    let bgmAudio = null;
    let timings = [];
    
    // UI States
    let isOverviewMode = false;
    let isBlackout = false;
    let isWhiteout = false;
    
    let deckContainer = null;
    let overlayNode = null; // For blackout/whiteout

    function init() {
        deckContainer = document.querySelector('.phantom-deck');
        slides = Array.from(document.querySelectorAll('.phantom-slide'));
        if (slides.length === 0) return;

        // Setup base styles for slides
        slides.forEach((s, i) => {
            s.dataset.index = i;
            if (i !== 0) {
                gsap.set(s, { opacity: 0, pointerEvents: 'none', zIndex: 0 });
                s.classList.remove('active');
            } else {
                gsap.set(s, { opacity: 1, pointerEvents: 'auto', zIndex: 10 });
                s.classList.add('active');
            }
        });

        createOverlay();
        initMedia();
        setupKeyboardNavigation();

        // Optional: trigger GSAP entry for first slide
        triggerSlideAnimation(0);
    }

    function createOverlay() {
        overlayNode = document.createElement('div');
        overlayNode.style.position = 'fixed';
        overlayNode.style.top = 0;
        overlayNode.style.left = 0;
        overlayNode.style.width = '100vw';
        overlayNode.style.height = '100vh';
        overlayNode.style.backgroundColor = 'black';
        overlayNode.style.opacity = 0;
        overlayNode.style.pointerEvents = 'none';
        overlayNode.style.zIndex = 99999;
        overlayNode.style.transition = 'opacity 0.4s ease';
        document.body.appendChild(overlayNode);
    }

    function initMedia() {
        ttsAudio = document.getElementById('tts-audio');
        bgmAudio = document.getElementById('bgm-audio');
        const timingEl = document.getElementById('timing-data');
        if (timingEl) {
            try {
                timings = JSON.parse(timingEl.textContent).entries || [];
            } catch (e) {
                console.warn('PhantomDeck: Failed to parse timings.json');
            }
        }
    }

    function setupKeyboardNavigation() {
        window.addEventListener('keydown', (e) => {
            // [MANDATORY] Intercept if user is editing content
            if (document.activeElement && (document.activeElement.contentEditable === 'true' || document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
                return;
            }

            if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
                if (!isOverviewMode) nextSlide();
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                if (!isOverviewMode) prevSlide();
            } else if (e.key === 'Escape') {
                toggleOverviewMode();
            } else if (e.key.toLowerCase() === 'b') {
                toggleBlackout();
            } else if (e.key.toLowerCase() === 'w') {
                toggleWhiteout();
            } else if (e.key.toLowerCase() === 'g') {
                // Future: Jump to slide prompt
            }
        });
    }

    function toggleBlackout() {
        if (isWhiteout) { isWhiteout = false; }
        isBlackout = !isBlackout;
        overlayNode.style.backgroundColor = 'black';
        overlayNode.style.opacity = isBlackout ? 1 : 0;
        overlayNode.style.pointerEvents = isBlackout ? 'auto' : 'none';
    }

    function toggleWhiteout() {
        if (isBlackout) { isBlackout = false; }
        isWhiteout = !isWhiteout;
        overlayNode.style.backgroundColor = 'white';
        overlayNode.style.opacity = isWhiteout ? 1 : 0;
        overlayNode.style.pointerEvents = isWhiteout ? 'auto' : 'none';
    }

    function toggleOverviewMode() {
        isOverviewMode = !isOverviewMode;
        if (isOverviewMode) {
            // Enter Bird's Eye View
            document.body.style.overflow = 'auto'; // allow scrolling if many slides
            const gap = 20;
            const columns = Math.ceil(Math.sqrt(slides.length));
            
            gsap.to(deckContainer, {
                scale: 0.25,
                transformOrigin: "top left",
                duration: 0.8,
                ease: "expo.inOut"
            });

            slides.forEach((s, i) => {
                const row = Math.floor(i / columns);
                const col = i % columns;
                
                gsap.to(s, {
                    x: col * 110 + "%",
                    y: row * 110 + "%",
                    opacity: 1, // Show all
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    duration: 0.8,
                    ease: "expo.inOut",
                    onComplete: () => {
                        s.onclick = () => {
                            if (isOverviewMode) {
                                toggleOverviewMode();
                                goToSlide(i);
                            }
                        };
                    }
                });
            });
        } else {
            // Exit Bird's Eye View
            document.body.style.overflow = 'hidden';
            gsap.to(deckContainer, { scale: 1, duration: 0.8, ease: "expo.inOut" });
            
            slides.forEach((s, i) => {
                s.onclick = null;
                s.style.cursor = 'default';
                gsap.to(s, {
                    x: "0%",
                    y: "0%",
                    opacity: i === currentSlide ? 1 : 0,
                    pointerEvents: i === currentSlide ? 'auto' : 'none',
                    duration: 0.8,
                    ease: "expo.inOut"
                });
            });
        }
    }

    function goToSlide(index) {
        if (index < 0 || index >= slides.length || index === currentSlide || isOverviewMode) return;
        
        const oldSlide = slides[currentSlide];
        const newSlide = slides[index];

        // [MANDATORY] Animation State Cleanup
        if (window.slideAnimations && window.slideAnimations[currentSlide] && window.slideAnimations[currentSlide].tl) {
            window.slideAnimations[currentSlide].tl.pause(0).kill();
        }
        // Force clear inline styles from previous animations to prevent ghosting
        gsap.set(oldSlide.querySelectorAll('*'), { clearProps: "all" });

        // MAGIC MOVE (GSAP Flip) Logic
        let flipState = null;
        if (window.Flip) {
            // Get elements on both slides sharing data-flip-id
            const flipElements = document.querySelectorAll(`[data-flip-id]`);
            if (flipElements.length > 0) {
                flipState = Flip.getState(flipElements);
            }
        }

        // Crossfade Transition
        gsap.to(oldSlide, { opacity: 0, pointerEvents: 'none', zIndex: 0, duration: 0.5, ease: "power2.inOut" });
        oldSlide.classList.remove('active');

        gsap.to(newSlide, { 
            opacity: 1, pointerEvents: 'auto', zIndex: 10, duration: 0.5, ease: "power2.inOut",
            onComplete: () => {
                if (flipState && window.Flip) {
                    Flip.from(flipState, {
                        duration: 1.2,
                        ease: "expo.out",
                        absolute: true,
                        nested: true
                    });
                }
                triggerSlideAnimation(index);
            }
        });
        
        newSlide.classList.add('active');
        currentSlide = index;
    }

    function nextSlide() { goToSlide(currentSlide + 1); }
    function prevSlide() { goToSlide(currentSlide - 1); }

    function triggerSlideAnimation(index) {
        if (window.slideAnimations && window.slideAnimations[index]) {
            window.slideAnimations[index].tl = window.slideAnimations[index].create();
            window.slideAnimations[index].tl.play();
        }
    }

    function startAutoPlay() {
        isAutoPlay = true;
        if (bgmAudio) {
            bgmAudio.volume = 0.25;
            bgmAudio.play();
        }
        if (ttsAudio) {
            ttsAudio.volume = 1.0;
            ttsAudio.play();
            
            ttsAudio.addEventListener('timeupdate', () => {
                const ct = ttsAudio.currentTime;
                const currentTiming = timings.find(t => ct >= t.start && ct <= t.end);
                
                if (currentTiming && typeof currentTiming.slide_index !== 'undefined') {
                    if (currentSlide !== currentTiming.slide_index) {
                        goToSlide(currentTiming.slide_index);
                    }
                }
            });
        }
    }

    return { init, nextSlide, prevSlide, goToSlide, startAutoPlay, toggleOverviewMode };
})();

window.addEventListener('DOMContentLoaded', () => {
    window.PhantomDeck.init();
});
