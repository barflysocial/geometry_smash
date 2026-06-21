# Course Honors Challenge

Render/GitHub-ready classroom proficiency quiz app with multiple courses, host-only answer keys, QR join, Music Sight Reading audio, and saved Back/Next student navigation.

## Courses Included

- Geometry Honors
- Algebra 2
- Music Sight Reading
- Biology
- AP Government

## Core Features

- Teacher/host creates a live session and selects a course and topics.
- Students join with a session code or scan the session QR code.
- Multiple-choice questions with plausible distractors.
- Correct answers are not locked into the first answer choice.
- Question order is randomized per student.
- Answer choice order is randomized per student and remains stable on refresh/rejoin.
- Students can move Back and Next through previous questions before final submission.
- Saved answers are preserved when moving Back/Next.
- Correct answers and explanations are never shown during the test.
- After the test, students see missed questions only with explanations.
- Host sees the full answer key, each student's answer, explanations, score, timing, and skill report.
- Tracks time per question and total test duration.
- No node_modules folder included.

## Music Sight Reading Features

- Browser-generated sound using Web Audio.
- Play Sound button on audio questions.
- Single-note, interval, rhythm, triad, and short melody playback.
- Treble-clef staff visuals.
- Notes-on-a-staff questions for note names, scale degrees, intervals, solfege, triads, accidentals, and short phrases.
- Bass, alto, and tenor clef reading are not included.

## Run Locally

```bash
npm install
npm start
```

Open:

- Host: http://localhost:3000/host
- Student: http://localhost:3000/student

## Render Settings

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: leave blank

## Notes

Live sessions are stored in `sessions.json`. On Render, file storage can reset when the service restarts. For long-term saved student history, connect a database such as Postgres later.
