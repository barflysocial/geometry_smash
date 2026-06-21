# Math & Course Honors Challenge

Render/GitHub-ready classroom proficiency quiz app.

## Courses Included

- Geometry Honors
- Algebra 2
- Music Sight Reading
- Biology
- AP Government

## Core Features

- Teacher/host creates a live session and selects a course and topics.
- Students join with a session code.
- Multiple-choice questions with plausible distractors.
- Correct answers are not locked into the first answer choice.
- Question order is randomized per student.
- Answer choice order is randomized per student and remains stable on refresh/rejoin.
- Students do not see the answer key during the test.
- After the test, students see missed questions only with explanation.
- Host sees the full answer key, each student's answer, explanations, score, timing, and skill report.
- Tracks time per question and total test duration.
- No node_modules folder included.

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
