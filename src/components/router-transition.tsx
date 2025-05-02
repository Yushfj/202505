"use client";

import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';

export const RouterTransition = ({children}: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const [displayChildren, setDisplayChildren] = useState(children);
    const [transitioning, setTransitioning] = useState(false);

    useEffect(() => {
        // Trigger transition effect only when pathname changes
        setTransitioning(true);
        const timer = setTimeout(() => {
            setDisplayChildren(children); // Update content after delay
            setTransitioning(false);
        }, 200); // Duration matches CSS transition

        return () => clearTimeout(timer);
        // Only depend on pathname for triggering the transition effect
    }, [pathname]);

    // Update displayed children immediately if children prop changes *when not transitioning*
    // This helps keep the content up-to-date if the component re-renders for other reasons
    useEffect(() => {
        if (!transitioning) {
            setDisplayChildren(children);
        }
    }, [children, transitioning]);


    return (
        <div className={`${transitioning ? 'opacity-0' : 'opacity-100'} transition-opacity duration-200`}>
            {displayChildren}
        </div>
    );
};
