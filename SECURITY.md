# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in very-ai, please report it responsibly.

**Do not open a public GitHub issue.**

Send an email to **security@gosign.de** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if you have one)

We will acknowledge receipt within 48 hours and provide a detailed response within 5 business days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x.x   | ✅        |
| < 1.0   | ❌        |

## Security Best Practices for Deployment

- Never expose very-ai directly to the internet without a reverse proxy
- Always use HTTPS in production
- Enable SSO — do not use local auth in production
- Regularly update dependencies: `npm audit fix`
- Enable audit logging and export logs to your SIEM
- Restrict database access to the application server only
