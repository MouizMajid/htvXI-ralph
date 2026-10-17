Game 1: "Firefly Tap"
Clinical Objective: Neurological Alertness & Reaction Time. Specifically designed to detect lethargy caused by high fevers or mild concussions.
Mechanics: A "whack-a-mole" style reaction test requiring the user to tap targets as they appear randomly on screen.
Technical Implementation:
UI/UX : A dark, full-screen environment. The target is an SVG/div with a CSS box-shadow to simulate a glow, toggling via display or opacity.
Logic :
Uses setTimeout with a randomized delay (2000–5000ms) to spawn the firefly.
Randomizes X/Y coordinates (Math.random() * 80 + 10%) to keep the target within viewport bounds.
Logs precise timestamps using Date.now() at the exact moment of spawn and the exact moment of the onClick/onTouchStart event.
Maintains a game loop of 5 iterations, storing the delta (reaction time) in an array to calculate a moving average.
Data Routing:
Threshold: < 1200ms (Healthy) vs. > 2000ms (Flagged).
Payload: Outputs a JSON string categorizing the assessment, average reaction time in milliseconds, the clinical status ("Lethargic/Delayed"), and assigns a "Medium" urgency flag.
What It Analyzes:
Motor Speed & Bradykinesia: Slowness of movement often tied to acute neurological fatigue, intoxication, or basal ganglia dysfunction.
Unilateral Weakness: Significant discrepancy between dominant and non-dominant hand dexterity (a key stroke indicator).
Physiological vs. Resting Tremor: High-frequency, low-amplitude jitter vs. low-frequency oscillations.

Scientific 
The Finger Tapping Test is a standard component of the Halstead-Reitan Neuropsychological Battery, used clinically for over 60 years to measure motor speed and lateralized brain damage. In movement disorder clinics, the Movement Disorder Society Unified Parkinson’s Disease Rating Scale (MDS-UPDRS Item 3.4) evaluates finger tapping to grade bradykinesia (slowness), hypokinesia (decreased amplitude), and arrest of movement. 


Game 2: 
"Cyber Circuit: Firewall Hacker" (Gamified Trail Making Test)
Target Audience: Adolescents and Pre-teens (Ages 10+) Clinical Objective: Concussion screening, executive function, mental fatigue, and complex task-switching.
Adolescents are less likely to be entertained by catching fireflies and more likely to hide symptoms of sports concussions or severe illness to avoid hospital stays. This game disguises a rigorous cognitive stress test as a fast-paced hacking puzzle.
What it does (Gameplay Mechanics) The teenager acts as a hacker trying to bypass a digital security system to unlock the clinic's Wi-Fi password or earn a digital reward.
Phase 1 (The Warm-up): The screen displays a scattered grid of glowing blue nodes numbered 1 to 25. The player must drag their finger to connect them in sequential order (1, 2, 3...) as fast as possible to "boot up" the hack.
Phase 2 (The Firewall Bypass): The grid resets, but this time it contains both numbers (1-13) and letters (A-L). To successfully breach the firewall, the player must alternate their connections (1 ➔ A ➔ 2 ➔ B ➔ 3 ➔ C) under a ticking countdown. If they make a mistake, the node flashes red and the system "glitches."
The Science & Research Behind It This is a digitized adaptation of the clinical Trail Making Test (TMT), a gold-standard neuropsychological assessment used extensively in pediatric neurology.
Phase 1 mirrors TMT Part A, which measures raw visual scanning and basic processing speed.
Phase 2 mirrors TMT Part B, which tests higher-order cognitive flexibility, working memory, and executive function. Alternating between two different sequences forces the prefrontal cortex to constantly shift mental sets and suppress the automatic urge to just count consecutive numbers.
Clinical Relevance: When a teenager is suffering from post-concussion syndrome, severe sleep deprivation, or a neuro-inflammatory response from a systemic infection (like severe flu or sepsis), their basic motor speed (Phase 1) might appear entirely normal. However, their complex task-switching capability (Phase 2) will drastically and measurably degrade.
