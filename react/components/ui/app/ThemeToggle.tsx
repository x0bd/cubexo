"use client";

import { useState, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MoonIcon, SunIcon } from "@/components/ui/icons";
import gsap from "gsap";

export default function ThemeToggle() {
	const [mounted, setMounted] = useState(false);
	const { theme, setTheme } = useTheme();
	const buttonRef = useRef<HTMLButtonElement>(null);
	const iconContainerRef = useRef<HTMLDivElement>(null);

	// Handle animations for theme change
	useEffect(() => {
		// Only run once mounted to avoid hydration issues
		if (!mounted || !buttonRef.current || !iconContainerRef.current) return;

		// Animate the button on theme change
		gsap.to(buttonRef.current, {
			backgroundColor:
				theme === "dark"
					? "rgba(30, 30, 30, 0.8)"
					: "rgba(240, 240, 240, 0.8)",
			boxShadow:
				theme === "dark"
					? "0 4px 12px rgba(0, 0, 0, 0.5)"
					: "0 4px 12px rgba(0, 0, 0, 0.1)",
			duration: 0.5,
		});

		// Animate icon rotation on theme change
		const tl = gsap.timeline();
		tl.to(iconContainerRef.current, {
			rotateY: 90,
			duration: 0.3,
			ease: "power1.inOut",
			onComplete: () => {
				// Finish rotation after icon has changed
				gsap.to(iconContainerRef.current, {
					rotateY: 0,
					duration: 0.3,
					ease: "power1.out",
				});
			},
		});
	}, [theme, mounted]);

	// Add hover animations
	useEffect(() => {
		const button = buttonRef.current;
		if (!button || !mounted) return;

		// Create hover animation
		const enterAnimation = () => {
			gsap.to(button, { scale: 1.1, duration: 0.3, ease: "power2.out" });
		};

		const leaveAnimation = () => {
			gsap.to(button, { scale: 1, duration: 0.3, ease: "power2.out" });
		};

		const downAnimation = () => {
			gsap.to(button, { scale: 0.9, duration: 0.2, ease: "power2.out" });
		};

		const upAnimation = () => {
			gsap.to(button, { scale: 1.1, duration: 0.2, ease: "power2.out" });
		};

		// Add event listeners
		button.addEventListener("mouseenter", enterAnimation);
		button.addEventListener("mouseleave", leaveAnimation);
		button.addEventListener("mousedown", downAnimation);
		button.addEventListener("mouseup", upAnimation);

		// Cleanup
		return () => {
			button.removeEventListener("mouseenter", enterAnimation);
			button.removeEventListener("mouseleave", leaveAnimation);
			button.removeEventListener("mousedown", downAnimation);
			button.removeEventListener("mouseup", upAnimation);
		};
	}, [mounted]);

	// Initial entrance animation
	useEffect(() => {
		const button = buttonRef.current;
		if (!button || !mounted) return;

		gsap.fromTo(
			button,
			{ opacity: 0, y: 20, scale: 0.8 },
			{
				opacity: 1,
				y: 0,
				scale: 1,
				duration: 0.6,
				delay: 0.7,
				ease: "elastic.out(1, 0.7)",
			}
		);
	}, [mounted]);

	// Prevent hydration mismatch
	useEffect(() => setMounted(true), []);

	if (!mounted) return null;

	const toggleTheme = () => {
		const newTheme = theme === "dark" ? "light" : "dark";

		// Button press animation
		const button = buttonRef.current;
		if (button) {
			gsap.timeline()
				.to(button, { scale: 0.9, duration: 0.1 })
				.to(button, {
					scale: 1,
					duration: 0.3,
					ease: "elastic.out(1.2, 0.5)",
				});
		}

		setTheme(newTheme);
	};

	return (
		<Button
			ref={buttonRef}
			variant="ghost"
			size="icon"
			className="fixed bottom-4 right-4 size-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-md transform-gpu"
			onClick={toggleTheme}
			aria-label="Toggle theme"
		>
			<div ref={iconContainerRef} style={{ perspective: "400px" }}>
				{theme === "dark" ? (
					<SunIcon className="size-5" />
				) : (
					<MoonIcon className="size-5" />
				)}
			</div>
		</Button>
	);
}
