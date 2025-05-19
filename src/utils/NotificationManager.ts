/**
 * Utility class for showing notifications
 */
export class NotificationManager {
	/**
	 * Show a notification
	 * @param message Message to display
	 * @param type Type of notification (success, error, info)
	 * @param duration Duration in ms before auto-hiding
	 */
	public static showNotification(
		message: string,
		type: "success" | "error" | "info" = "success",
		duration: number = 3000
	): void {
		// Remove any existing notifications
		const existingNotifications =
			document.querySelectorAll(".notification");
		existingNotifications.forEach((notification) => notification.remove());

		// Create notification element
		const notification = document.createElement("div");
		notification.className =
			"notification fixed top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 py-2 px-4 bg-white text-black rounded-lg shadow-lg z-50 transition-opacity duration-300";

		// Add icon based on type
		const iconSvg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg"
		);
		iconSvg.setAttribute("width", "16");
		iconSvg.setAttribute("height", "16");
		iconSvg.setAttribute("viewBox", "0 0 24 24");
		iconSvg.setAttribute("fill", "none");
		iconSvg.setAttribute("stroke", "currentColor");
		iconSvg.setAttribute("stroke-width", "2");
		iconSvg.setAttribute("stroke-linecap", "round");
		iconSvg.setAttribute("stroke-linejoin", "round");

		const path = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"path"
		);

		if (type === "success") {
			path.setAttribute("d", "M20 6L9 17l-5-5");
		} else if (type === "error") {
			path.setAttribute("d", "M18 6L6 18M6 6l12 12");
		} else {
			// Info icon
			path.setAttribute("d", "M12 16v-4M12 8h.01");

			// Add a circle for the info icon
			const circle = document.createElementNS(
				"http://www.w3.org/2000/svg",
				"circle"
			);
			circle.setAttribute("cx", "12");
			circle.setAttribute("cy", "12");
			circle.setAttribute("r", "10");
			iconSvg.appendChild(circle);
		}

		iconSvg.appendChild(path);

		// Text content
		const textSpan = document.createElement("span");
		textSpan.textContent = message;
		textSpan.className = "text-sm font-medium";

		// Append elements
		notification.appendChild(iconSvg);
		notification.appendChild(textSpan);

		// Add to DOM
		document.body.appendChild(notification);

		// Remove after delay with fade-out animation
		setTimeout(() => {
			notification.style.opacity = "0";
			notification.addEventListener("transitionend", () => {
				notification.remove();
			});
		}, duration);
	}
}
