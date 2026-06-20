# Geometry Honors Challenge

A high school Honors Geometry proficiency game with separate student and host screens.

## Includes

- 25 Geometry topics
- 50 questions per topic
- 1,250 total questions
- Unique randomized question sets per student
- Multiple-choice answers student screen
- Stable refresh/rejoin behavior
- Student screen hides the answer key
- Host/teacher screen shows each student's assigned questions, typed answers, correct answers, explanations, score report, time per question, total test time, and average answer time

## Local Run

```bash
npm install
npm start
```

Open:

- Host: `http://localhost:3000/host`
- Student: `http://localhost:3000/student`

## GitHub Upload

Upload the files in this folder directly to the root of your GitHub repository. Do not upload a parent folder above these files.

The repository root should look like this:

```txt
package.json
server.js
questions.json
render.yaml
.gitignore
README.md
public/
```

## Render Deploy Settings

If Render detects `render.yaml`, it can deploy automatically as a Node web service.

Manual Render settings:

- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Root Directory: leave blank if these files are at the repository root

## Security Note

The student API does not send `correctAnswer` or `explanation`. Students receive only the question and a multiple-choice field. The host dashboard is the only screen that receives the answer key.

## Important Persistence Note

This simple version stores live sessions in `sessions.json` on the server. On Render free/basic deployments, file storage may reset when the service restarts. For long-term classroom records, add a database later.


## Typed-answer update

This version removes multiple choice from the student side. Students type one answer per question. The host screen remains the only place where the correct answer key and explanations are shown.


## Timing Update

This version does **not** use countdown timers or force students forward. It tracks elapsed time instead:

- time spent on each individual question
- total test duration per student
- average answer time per student
- average time by skill/category on the host report

Students see their running question time and total test time. The host sees the timing data in the Players, Answer Review, and Skill Report tabs.


## Multiple-Choice Anti-Cheating Update

Student questions are multiple choice again. Each student receives a stable randomized question set, and each question receives a stable randomized choice order for that student. The correct answer is not locked to the first choice. Distractors are kept close to the correct answer where possible so answers are less obvious. The answer key remains host-only.


## Student Review Mode

After a student submits the test, the student screen shows **missed questions only**. For each missed question, students see their selected answer, the correct answer, the topic/skill, time spent, and a short explanation. Correct answers and explanations are not shown during the test. The host screen still has the full answer key and full student report.
