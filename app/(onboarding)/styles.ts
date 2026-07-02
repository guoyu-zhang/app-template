import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#555555",
    marginBottom: 8,
  },
  backButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d2d2d2",
    marginBottom: 6,
  },
  backButtonText: {
    fontSize: 14,
    color: "#444444",
    fontWeight: "600",
  },
  boxButton: {
    borderWidth: 1,
    borderColor: "#d2d2d2",
    borderRadius: 14,
    paddingVertical: 22,
    paddingHorizontal: 16,
    gap: 6,
    backgroundColor: "#fafafa",
  },
  boxTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111111",
  },
  boxSubtitle: {
    fontSize: 14,
    color: "#666666",
  },
  onboardingCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d2d2d2",
    backgroundColor: "#fafafa",
    padding: 16,
  },
  onboardingText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#333333",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d2d2d2",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: "#0a7ea4",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  oauthContainer: {
    gap: 10,
    marginTop: 4,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#d2d2d2",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  secondaryButtonText: {
    color: "#222222",
    fontSize: 15,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.6,
  },
  message: {
    textAlign: "center",
    color: "#333333",
    fontSize: 14,
  },
});
