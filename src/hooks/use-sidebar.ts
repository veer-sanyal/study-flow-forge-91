import React, { useState, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";

interface SidebarContextType {
  isCollapsed: boolean;
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

interface SidebarProviderProps {
  children: ReactNode;
  defaultCollapsed?: boolean;
}

export function SidebarProvider(props: SidebarProviderProps) {
  const { children, defaultCollapsed = false } = props;
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const collapse = useCallback(function collapseHandler() {
    setIsCollapsed(true);
  }, []);
  
  const expand = useCallback(function expandHandler() {
    setIsCollapsed(false);
  }, []);
  
  const toggle = useCallback(function toggleHandler() {
    setIsCollapsed(function(prev) { return !prev; });
  }, []);

  const value = { isCollapsed, collapse, expand, toggle };

  return React.createElement(
    SidebarContext.Provider,
    { value: value },
    children
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

export function useSidebarOptional() {
  const context = useContext(SidebarContext);
  if (!context) {
    return { 
      isCollapsed: false, 
      collapse: function() {}, 
      expand: function() {}, 
      toggle: function() {} 
    };
  }
  return context;
}
