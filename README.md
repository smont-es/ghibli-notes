# Ghibli Notes

A secure, serverless notes application inspired by Studio Ghibli. This project is being rebuilt with AWS cloud services, authentication, and security best practices.

## Project Overview

Ghibli Notes allows users to create, view, edit, search, and delete personal notes through a web interface featuring a Studio Ghibli-inspired visual theme.

The application is being developed as a portfolio project to demonstrate practical skills in cloud computing, serverless architecture, backend development, networking, and information security.

## Project Goals

- Build a responsive frontend using HTML, CSS, and JavaScript.
- Implement secure user authentication with Amazon Cognito.
- Develop serverless backend functions using AWS Lambda and Node.js.
- Create RESTful API endpoints using Amazon API Gateway.
- Store user notes in Amazon DynamoDB.
- Host the frontend using Amazon S3 and CloudFront.
- Apply IAM least-privilege permissions.
- Monitor application activity using Amazon CloudWatch.
- Define cloud infrastructure using AWS SAM.
- Document and test the application.

## Planned Architecture

The application will use the following architecture:

1. Users access the application through Amazon CloudFront.
2. CloudFront serves the frontend from a private Amazon S3 bucket.
3. Amazon Cognito handles user authentication.
4. The frontend sends authenticated requests to Amazon API Gateway.
5. API Gateway validates JWT tokens using a Cognito authorizer.
6. AWS Lambda processes application requests.
7. Amazon DynamoDB stores user notes.
8. Amazon CloudWatch collects application logs and monitoring data.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Authentication | Amazon Cognito |
| API | Amazon API Gateway HTTP API |
| Backend | AWS Lambda |
| Runtime | Node.js 22 |
| Database | Amazon DynamoDB |
| Hosting | Amazon S3 and CloudFront |
| Infrastructure as Code | AWS SAM |
| Monitoring | Amazon CloudWatch |
| Local Development | Docker, WSL 2 |
| Version Control | Git and GitHub |

## Project Structure

```text
ghibli-notes/
├── frontend/
│   ├── css/
│   ├── js/
│   └── assets/
├── backend/
│   ├── functions/
│   └── shared/
├── infrastructure/
├── docs/
├── tests/
│   ├── unit/
│   └── integration/
├── .gitignore
└── README.md
```

## Planned API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/notes` | Create a note |
| GET | `/notes` | Retrieve a user's notes |
| GET | `/notes/{noteId}` | Retrieve an individual note |
| PATCH | `/notes/{noteId}` | Update a note |
| DELETE | `/notes/{noteId}` | Delete an individual note |
| DELETE | `/notes` | Delete all notes belonging to the authenticated user |

All API endpoints will require authentication.

## Database Design

The planned DynamoDB table will use:

| Attribute | Type | Purpose |
|---|---|---|
| userId | String (Partition Key) | Identifies the note owner |
| noteId | String (Sort Key) | Uniquely identifies a note |
| title | String | Note title |
| text | String | Note content |
| createdAt | String | Creation timestamp |
| updatedAt | String | Last modification timestamp |

The authenticated user's Cognito subject (`sub`) will determine the `userId`. The backend will not trust a user ID supplied by the frontend.

## Security Considerations

- Amazon Cognito authentication.
- JWT validation through API Gateway.
- Per-user data isolation in DynamoDB.
- IAM least-privilege permissions.
- HTTPS for application and API traffic.
- Private S3 frontend bucket with CloudFront Origin Access Control.
- Server-side input validation.
- No AWS credentials or secrets committed to source control.
- CloudWatch logging and monitoring.

## Local Development Requirements

- Node.js 22 LTS
- npm
- AWS CLI
- AWS SAM CLI
- Docker Desktop
- Git
- Visual Studio Code

## Documentation

Additional technical documentation will be maintained in the `docs/` directory:

- Architecture design
- API reference
- Database design
- Deployment guide
- Security documentation

## Project Status

**Currently in development.**

The development environment and initial GitHub repository have been established. Application implementation, infrastructure configuration, testing, and AWS deployment are planned next.

## Future Improvements

- Note categories and tags.
- Improved note search.
- Rich-text editing.
- Additional visual themes.
- Automated testing and deployment through GitHub Actions.
- Expanded monitoring and security auditing.

## Author

Developed as a personal cloud computing and information security portfolio project.