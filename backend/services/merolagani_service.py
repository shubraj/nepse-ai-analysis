"""Merolagani API client service."""

from core.client import MerolaganiClient


class MerolaganiService:
    @staticmethod
    def get_company_list() -> list[dict[str, str]]:
        with MerolaganiClient() as client:
            return client.get_company_list()

    @staticmethod
    def get_company_detail(symbol: str) -> dict:
        with MerolaganiClient() as client:
            return client.get_company_detail(symbol)
