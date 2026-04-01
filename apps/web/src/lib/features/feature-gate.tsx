import { hasFeature } from "./flags";

type FeatureGateProps = {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export async function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const enabled = await hasFeature(feature);

  if (!enabled) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
