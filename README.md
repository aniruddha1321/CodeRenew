# Code Renew

## Overview

The **Code Renew** is a desktop application designed to automatically convert legacy Python 2 code to modern, secure, and idiomatic Python 3. It also provides a comprehensive security analysis of the converted code, identifying potential vulnerabilities and suggesting improvements. This tool is ideal for developers looking to modernize their Python projects, improve code quality, and enhance security.

## Features

* **Code Conversion**: Converts Python 2 code to Python 3 with type hints.
* **Security Analysis**: Identifies security vulnerabilities, bad practices, and compliance risks in the converted code.
* **AI-Powered**: Leverages the power of AI to provide intelligent code modernization and security auditing.
* **User-Friendly Interface**: A simple and intuitive desktop application built with Electron and React.
* **GitHub Integration**: Allows users to import and convert files directly from their GitHub repositories.

## Technologies Used

This project is built with a modern tech stack, including:

* **Frontend**:
    * [Vite](https://vitejs.dev/)
    * [TypeScript](https://www.typescriptlang.org/)
    * [React](https://reactjs.org/)
    * [shadcn-ui](https://ui.shadcn.com/)
    * [Tailwind CSS](https://tailwindcss.com/)
* **Backend**:
    * [Flask](https://flask.palletsprojects.com/)
    * [Python](https://www.python.org/)
    * [Groq](https://groq.com/)\n    * [Llama 3.3](https://groq.com/)
* **Desktop App**:
    * [Electron](https://www.electronjs.org/)

## Getting Started

To get started with the Code Renew, follow these steps:

### Prerequisites

* Node.js and npm installed. You can use [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) to manage your Node.js versions.
* Python 3 installed.
* Rust and Cargo for the `api_manager` CLI tool.

### Installation and Running

1.  **Clone the repository:**

    ```sh
    git clone https://github.com/kronten28/legacycodemodernizer.git
    ```

2.  **Navigate to the project directory:**

    ```sh
    cd legacycodemodernizer
    ```

3.  **Install the necessary dependencies:**

    ```sh
    npm install
    ```

4.  **Start the development server:**

    ```sh
    npm run dev
    ```

This will start the Vite development server, build the Electron app, and launch the Code Renew application.

## How It Works

The Code Renew uses a combination of traditional and AI-powered techniques to modernize your code:

1.  **Initial Conversion**: The application first uses the `2to3` library to perform an initial conversion of the Python 2 code to Python 3.
2.  **AI Modernization**: The converted code is then passed to the AI model (GPT-4.1) to add type hints, remove unnecessary comments, and improve the code to make it more idiomatic and robust in Python 3.
3.  **Security Analysis**: The modernized code is then analyzed for security vulnerabilities, bad practices, and compliance risks using the AI model.
4.  **Reporting**: The application provides a detailed report of the changes made to the code, as well as any security issues that were found.

This multi-step process ensures that your code is not only compatible with Python 3 but also secure, efficient, and easy to maintain.
