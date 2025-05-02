"use client";

import {usePathname} from 'next/navigation';
import {useEffect, useState} from 'react';

export const RouterTransition = ({children}: { children: React.ReactNode }) => {
    const pathname = usePathname();
    const [displayChildren, setDisplayChildren] = useState(children);
    const [transitioning, setTransitioning] = useState(false);

    useEffect(() => {
        setTransitioning(true);
        const timer = setTimeout(() => {
            setDisplayChildren(children);
            setTransitioning(false);
        }, 200);

        return () => clearTimeout(timer);
    }, [children]);

    return (
        <div className={`${transitioning ? 'transition-opacity duration-200 opacity-0' : 'transition-opacity duration-200 opacity-100'}`}>
            {displayChildren}
        </div>
    );
};
