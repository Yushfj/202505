'use client'; // Keep this for the main component for now

// Remove Suspense import from here, it's now in ApproveWagesClient.tsx
import ApproveWagesClientWrapper from './ApproveWagesClient'; // Import the wrapper component

// This component now just renders the wrapper which handles Suspense
const ApproveWagesPage = () => {
    return (
        <ApproveWagesClientWrapper />
    );
};

export default ApproveWagesPage;