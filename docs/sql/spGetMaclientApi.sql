-- Canal emisor por token (maclient_api).

CREATE OR ALTER PROCEDURE [dbo].[spGetMaclientApi]
    @xtoken VARCHAR(100)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT TOP 1 *
    FROM maclient_api
    WHERE xtoken = @xtoken;
END;
