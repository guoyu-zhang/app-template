# Google Sign-In Setup Guide

A step-by-step guide for setting up Firebase, the Google Auth Platform, and OAuth client credentials for Web, Android, and iOS.

---

## Overview

This guide walks through the full process of configuring Google sign-in for the app, covering three main stages:

1. Create a Firebase project
2. Set up a profile on the Google Auth Platform
3. Create OAuth client IDs for Web, Android, and iOS

---

## 1. Firebase

### Create a Project

Set up a new Firebase project, which will serve as the backend foundation for authentication and any other Firebase services the app uses.

- Go to the Firebase Console (console.firebase.google.com).
- Click "Add project" and follow the setup wizard.
- Once created, this project will be linked to the Google Auth Platform configuration in the next step.

---

## 2. Google Auth Platform (Google Cloud Console)

### Create a Profile

The Google Auth Platform manages the OAuth consent screen and branding details shown to users when they sign in with Google.

- Go to the Google Auth Platform in Google Cloud Console.
- Create a new profile, making sure it is associated with the same Google Cloud project backing the Firebase project from Step 1.
- Fill in the required app information (app name, support email, logo, etc.) for the consent screen.

---

## 3. Create OAuth Client (Google Cloud Console)

Within the same project, create separate OAuth client IDs for each platform the app supports: Web, Android, and iOS.

### Web

- In Google Cloud Console, go to "Credentials" and click "Create Credentials" → "OAuth client ID."
- Select "Web application" as the application type.
- Add the appropriate authorized JavaScript origins and redirect URIs for the app.

### Android

- Select "Android" as the application type when creating the OAuth client.
- Add the package name to the app configuration. In `app.json`, under the `android` section, add:

```json
"package": "com.xlaris.apptemplateid"
```

- Retrieve the SHA-1 certificate fingerprint, which Google requires to verify the app. Run the following command to get it from EAS:

```bash
eas credentials -p android
```

- Copy the SHA-1 value from the command output and paste it into the SHA certificate fingerprint field when creating the Android OAuth client.

- You don't add the Android client ID into app.json, your code, or anywhere manually — it just needs to exist correctly in Google's system (package name + SHA-1 matching), and google-services.json is the file that carries that info into your app at build time.

- Make sure to add the SHA-1 to firebase too (your project -> your apps)

### iOS

- Select "iOS" as the application type when creating the OAuth client.
- Add the app's iOS bundle identifier (this should match the bundle identifier configured in `app.json` under the `ios` section).
- Also add in signin and signup tsx, search for ios client id.
- Save the generated iOS client ID for use in the app's configuration.

---

> **Note:** Make sure the Firebase project, Google Auth Platform profile, and all OAuth clients are created under the same Google Cloud project so they stay linked correctly.

---

## 4. Supabase Sign in providers

Don't forget to put update supabase sign in providers, enable apple sign in and add the client id, enable google sign in and ad the web client id and the secret key

You may also need to check the skip nonce checks for google sign in.
