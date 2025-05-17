import { gsap } from "gsap";

/**
 * Sets up the UI components and interactions
 */
export function setupUI(): void {
	// Create header animations
	animateHeader();

	// Add event listeners
	setupEventListeners();
}

/**
 * Animates the header elements
 */
function animateHeader(): void {
	const header = document.getElementById("header");
	if (!header) return;

	// Fade in header elements
	gsap.from(header.children, {
		opacity: 0,
		y: 20,
		stagger: 0.1,
		duration: 1,
		ease: "power3.out",
		delay: 0.5,
	});
}

/**
 * Sets up event listeners for UI interactions
 */
function setupEventListeners(): void {
	// Example: Add keyboard controls
	document.addEventListener("keydown", (e) => {
		switch (e.key) {
			case "f":
				toggleFullscreen();
				break;
			// Add more keyboard shortcuts as needed
		}
	});

	// Custom cursor effect
	setupCustomCursor();
}

/**
 * Toggles fullscreen mode
 */
function toggleFullscreen(): void {
	if (!document.fullscreenElement) {
		document.documentElement.requestFullscreen().catch((err) => {
			console.error(
				`Error attempting to enable fullscreen mode: ${err.message}`
			);
		});
	} else {
		if (document.exitFullscreen) {
			document.exitFullscreen();
		}
	}
}

/**
 * Sets up a custom cursor effect
 */
function setupCustomCursor(): void {
	// Create a custom cursor element
	const cursor = document.createElement("div");
	cursor.className = "custom-cursor";
	document.body.appendChild(cursor);

	// Create a follower element (larger ring that follows behind)
	const follower = document.createElement("div");
	follower.className = "cursor-follower";
	document.body.appendChild(follower);

	// Initialize cursor position outside of viewport
	let cursorX = -100;
	let cursorY = -100;
	let followerX = -100;
	let followerY = -100;

	// Track mouse position
	document.addEventListener("mousemove", (e) => {
		cursorX = e.clientX;
		cursorY = e.clientY;
	});

	// Animate cursor and follower
	function animateCursor() {
		// Smoothly interpolate follower position
		followerX += (cursorX - followerX) * 0.1;
		followerY += (cursorY - followerY) * 0.1;

		// Update element positions
		cursor.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
		follower.style.transform = `translate(${followerX}px, ${followerY}px)`;

		requestAnimationFrame(animateCursor);
	}

	// Start the animation loop
	animateCursor();

	// Add interactive states
	document.addEventListener("mousedown", () => {
		cursor.classList.add("active");
		follower.classList.add("active");
	});

	document.addEventListener("mouseup", () => {
		cursor.classList.remove("active");
		follower.classList.remove("active");
	});

	// Add style for the cursors
	const style = document.createElement("style");
	style.textContent = `
    body {
      cursor: none;
    }
    .custom-cursor {
      position: fixed;
      width: 8px;
      height: 8px;
      background: #ffffff;
      border-radius: 50%;
      pointer-events: none;
      z-index: 9999;
      transform: translate(-50%, -50%);
      mix-blend-mode: difference;
    }
    .cursor-follower {
      position: fixed;
      width: 40px;
      height: 40px;
      border: 1px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      pointer-events: none;
      z-index: 9998;
      transform: translate(-50%, -50%);
      transition: width 0.2s, height 0.2s;
    }
    .custom-cursor.active {
      transform: translate(-50%, -50%) scale(0.5);
    }
    .cursor-follower.active {
      transform: translate(-50%, -50%) scale(1.5);
    }
  `;
	document.head.appendChild(style);
}
