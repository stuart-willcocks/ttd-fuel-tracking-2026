# Autonomous Development & Deployment Workflow

This repository enforces an autonomous, end-to-end development mode. The agent must proceed through complete cycles without stopping for step-by-step approvals or intermediate confirmations.

## Operating Principles

1. **End-to-End Execution**:
   - When a feature, bug fix, or UI adjustment is requested, autonomously investigate, modify all necessary files, compile, test, commit, and deploy.
   - Do not pause or prompt the user for confirmation between intermediate sub-tasks (such as reading code, making edits, running build commands, or creating commits).

2. **Automated Verification**:
   - Always execute `npm run build` (`tsc -b && vite build`) to verify zero TypeScript errors and a clean production bundle before committing.
   - If any compilation or lint errors occur, autonomously diagnose and resolve them immediately without asking the user.

3. **Automated Versioning & Deployment**:
   - The pre-commit hook automatically runs `node scripts/bump_build.js` on every commit, incrementing the build integer.
   - Stage and commit all changes on the `staging` branch with a clear, concise commit message.
   - Immediately push to `origin staging` (`git push origin staging`) to trigger the Vercel staging deployment.
   - **Never** merge or push to `origin main` (production) unless the user explicitly asks to promote or deploy to production.
   - Verify deployment status before concluding.

4. **Concise Reporting**:
   - Return to the user only after the entire request has been implemented, verified, pushed, and deployed live.
   - Keep final responses direct and concise, listing what changed and the new build number.

5. **Zebra TC26 PDA Constraints**:
   - Never add verbose or unsolicited onscreen text (e.g. "Hardware scanner ready") to the MAIN SCREEN unless explicitly requested.
   - Keep the MAIN SCREEN scan input box full width, center-justified, and always focused with virtual keyboard hidden (`inputMode="none"`).
   - Ensure the outer page layout remains constrained to the PDA screen (`100dvh`, `overflow: hidden`, no outer vertical scrollbar).
