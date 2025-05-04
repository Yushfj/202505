'use client'; // Keep this for the main component for now

import { Suspense } from 'react';
import ApproveWagesClient from './ApproveWagesClient'; // Import the new client component
import { Loader2 } from 'lucide-react';

// This component now acts as the Suspense boundary wrapper
const ApproveWagesPage = () => {
    return (
        <Suspense fallback={<LoadingFallback />}>
            <ApproveWagesClient />
        </Suspense>
    );
};

// Simple loading component to show while Suspense is waiting
const LoadingFallback = () => {
    return (
        <div className="flex justify-center items-center min-h-screen bg-muted p-4">
            <div className="flex items-center text-lg text-primary">
                <Loader2 className="mr-2 h-6 w-6 animate-spin" />
                Loading Approval Page...
            </div>
        </div>
    );
};


export default ApproveWagesPage;