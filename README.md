# Geometry Honors Challenge

A high school Honors Geometry proficiency game with separate student and host screens.

## Includes

- 25 Geometry topics
- 50 questions per topic
- 1,250 total questions
- Unique randomized question sets per student
- Randomized answer choices per student
- Stable refresh/rejoin behavior
- Student screen hides the answer key
- Host/teacher screen shows each student's assigned questions, selected answers, correct answers, explanations, and score report

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

The student API does not send `correctAnswer` or `explanation`. Students receive only the question and shuffled answer choices. The host dashboard is the only screen that receives the answer key.

## Important Persistence Note

This simple version stores live sessions in `sessions.json` on the server. On Render free/basic deployments, file storage may reset when the service restarts. For long-term classroom records, add a database later.


## Typed-answer update

This version removes multiple choice from the student side. Students type one answer per question. The host screen remains the only place where the correct answer key and explanations are shown.
