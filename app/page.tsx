import type { Metadata } from "next";
import HowmuApp from "./HowmuApp";

export const metadata: Metadata = {
  title: "HOWMU 하무 – 해외여행 현지 가격 확인",
  description: "여행지 가격을 입력하면 내 통화로 바로 알려드려요.",
};

export default function Home() {
  return <HowmuApp />;
}
