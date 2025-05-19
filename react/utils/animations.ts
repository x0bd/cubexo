import gsap from "gsap";

/**
 * Animation utilities using GSAP
 */
export const animations = {
	/**
	 * Fade in an element
	 */
	fadeIn: (
		element: HTMLElement,
		duration = 0.5,
		delay = 0,
		ease = "power2.out"
	) => {
		return gsap.fromTo(
			element,
			{ opacity: 0, y: 10 },
			{ opacity: 1, y: 0, duration, delay, ease }
		);
	},

	/**
	 * Fade out an element
	 */
	fadeOut: (
		element: HTMLElement,
		duration = 0.5,
		delay = 0,
		ease = "power2.in"
	) => {
		return gsap.to(element, { opacity: 0, y: -10, duration, delay, ease });
	},

	/**
	 * Transition between models
	 */
	modelTransition: (container: HTMLElement, callback: () => void) => {
		// First fade out
		gsap.to(container, {
			opacity: 0,
			scale: 0.95,
			duration: 0.4,
			ease: "power2.in",
			onComplete: () => {
				// Execute the callback (change model)
				callback();

				// Then fade back in
				gsap.to(container, {
					opacity: 1,
					scale: 1,
					duration: 0.6,
					ease: "elastic.out(1, 0.7)",
				});
			},
		});
	},

	/**
	 * Button hover animation
	 */
	buttonHover: (element: HTMLElement) => {
		// On hover
		element.addEventListener("mouseenter", () => {
			gsap.to(element, {
				scale: 1.05,
				duration: 0.3,
				ease: "power2.out",
			});
		});

		// On hover out
		element.addEventListener("mouseleave", () => {
			gsap.to(element, { scale: 1, duration: 0.3, ease: "power2.out" });
		});

		// On click
		element.addEventListener("mousedown", () => {
			gsap.to(element, {
				scale: 0.95,
				duration: 0.2,
				ease: "power2.out",
			});
		});

		element.addEventListener("mouseup", () => {
			gsap.to(element, {
				scale: 1.05,
				duration: 0.2,
				ease: "power2.out",
			});
		});
	},

	/**
	 * Export notification animation
	 */
	showExportNotification: (message: string) => {
		// Remove any existing notifications
		const existingNotifications = document.querySelectorAll(
			".export-notification"
		);
		existingNotifications.forEach((notification) => {
			gsap.to(notification, {
				opacity: 0,
				y: -20,
				duration: 0.3,
				onComplete: () => notification.remove(),
			});
		});

		// Create the notification element
		const notification = document.createElement("div");
		notification.className =
			"export-notification fixed bottom-16 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-4 py-2 rounded-full border border-border shadow-md flex items-center gap-2 text-sm z-50";
		notification.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span>${message}</span>
    `;

		document.body.appendChild(notification);

		// Animate in
		gsap.fromTo(
			notification,
			{ opacity: 0, y: 20 },
			{ opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }
		);

		// Animate out after delay
		gsap.to(notification, {
			opacity: 0,
			y: -20,
			duration: 0.5,
			delay: 2,
			ease: "power3.in",
			onComplete: () => notification.remove(),
		});
	},
};
