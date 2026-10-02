# Reporting security problems

Deskly is a pre-release desktop app. Only the latest source revision is maintained; older prototype packages should not be used for sensitive work.

Do not publish API keys, private project files or exploit details in a public issue. Use GitHub's **Security → Report a vulnerability** for this repository when private reporting is available. If it is unavailable, open a public issue asking the maintainer for a private contact channel without including sensitive details.

Include the revision/version, operating system, affected component, reproduction steps, impact and a minimal example using dummy data. A normal diagnostic export can provide version information without private content. This repository has no guaranteed response time yet.

Project file tools enforce folder boundaries, but approved shell commands run with your OS permissions. This is not a full system sandbox. See [privacy and storage](docs/PRIVACY.md) and [release gates](RELEASE_POLICY.md).
