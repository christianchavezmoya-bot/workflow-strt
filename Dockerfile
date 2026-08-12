# Build context: repository root
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY server/Commtrac.Api/ ./Commtrac.Api/
RUN dotnet restore ./Commtrac.Api/Commtrac.Api.csproj
RUN dotnet publish ./Commtrac.Api/Commtrac.Api.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Commtrac.Api.dll"]
